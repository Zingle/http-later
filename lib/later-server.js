var middleware = require("./middleware"),
    application = require("./application"),
    send = require("./send-serialized"),
    headers = require("./headers"),
    queue = require("async").queue,
    forward = require("event-emitter-forward"),
    http = require("http"),
    https = require("https"),
    EventEmitter = require("events").EventEmitter,
    prop = require("propertize");

// ensure color support enabled
require("colors");

/**
 * @typedef {object} Accept
 * @property {string} host
 * @property {number} port
 * @property {string} paths
 * @property {string} methods
 * @property {object} tls
 * @property {string} [tls.pfx]
 * @property {string} [tls.cert]
 * @property {string} [tls.key]
 * @property {string} [tls.ca]
 */

/**
 * HTTP later server object.
 * @constructor
 * @augments {EventEmitter}
 * @param {object} opts
 * @param {LaterStorage} opts.storage
 * @param {Accept[]} [opts.accepts]
 * @param {string[]} [opts.methods]
 */
function LaterServer(opts) {
    EventEmitter.call(this);

    opts.accepts = opts.accepts ? opts.accepts.slice() : [];
    opts.methods = opts.methods ? opts.methods.slice() : [];
    opts.paths = opts.paths ? opts.paths.slice() : [];

    if (opts.methods.length === 0) {
        opts.methods = undefined;
    }

    if (opts.paths.length === 0) {
        opts.paths = undefined;
    }

    prop.internal(this, "queue");
    prop.internal(this, "hosts", []);
    prop.internal(this, "application");
    prop.internal(this, "middleware");

    /**
     * @name LaterServer#storage
     * @type {LaterStorage}
     * @readonly
     */
    prop.readonly(this, "storage", opts.storage);

    /**
     * @name LaterServer#accepts
     * @type {Accept[]}
     * @readonly
     */
    prop.readonly(this, "accepts", opts.accepts);

    /**
     * @name LaterServer#methods
     * @type {string[]|undefined}
     * @readonly
     */
    prop.readonly(this, "methods", opts.methods);

    /**
     * @name LaterServer#paths
     * @type {string[]|undefined}
     * @readonly
     */
    prop.readonly(this, "paths", opts.paths);
}

LaterServer.prototype = Object.create(EventEmitter.prototype);
LaterServer.prototype.constructor = LaterServer;

/**
 * Create a server object.
 * @param {object} opts
 * @param {LaterStorage} opts.storage
 * @param {Accept[]} [opts.accepts]
 */
LaterServer.create = function(opts) {
    return new LaterServer(opts);
};

/**
 * Create Connect middleware to accept incoming requests for this server.
 * @returns {function}
 */
LaterServer.prototype.createMiddleware = function() {
    return middleware(this);
};

/**
 * Load the server middleware from this instance or create new one.
 * @returns {function}
 */
LaterServer.prototype.loadMiddleware = function() {
    if (!this.middleware) prop.value(this, "middleware", this.createMiddleware());
    return this.middleware;
};

/**
 * Create Express.js application to handle incoming requests for this server.
 * @param {function} middleware
 * @returns {function}
 */
LaterServer.prototype.createApplication = function(middleware) {
    return application(this, middleware);
};

/**
 * Load the server application from this instance or create a new one.
 * @returns {function}
 */
LaterServer.prototype.loadApplication = function() {
    if (!this.application) prop.value(this, "application", this.createApplication(this.loadMiddleware()));
    return this.application;
};

/**
 * Create replay queue.
 * @returns {object}
 */
LaterServer.prototype.createQueue = function() {
    var worker;

    // create a queue which accepts node-style async tasks
    worker = function(task, done) {task(done);};
    return queue(worker, this.concurrency || 20);
};

/**
 * Begin replaying queued requests.
 */
LaterServer.prototype.replay = function() {
    var later = this,
        refillBackoff = [0,1],
        refillSize = 50;        // max refilled

    function refill(done) {
        var count = 0;

        function unqueue() {
            if (++count > refillSize) {
                later.queue.push(refill);
                done();
                return;
            }

            later.storage.unqueue(function(err, req) {
                if (err) done(err);
                else if (req) later.queue.push(tryRequest.bind(null, req));
                else if (count === 1) {
                    refillBackoff[2] = refillBackoff[0] + refillBackoff[1];
                    refillBackoff.shift();
                    later.emit("backoff");
                    done();
                } else {
                    refillBackoff = [0,1];
                    done();
                }
            });
        }

        function tryRequest(req, done) {
            var read = headers.read.bind(null, req.headers),
                write = headers.write.bind(null, req.headers),
                attempts = read("X-Later-Retry-Attempts");

            // verify attempts remaining
            attempts = attempts ? parseInt(attempts) : 1;
            if (attempts < 0) attempts = 0;
            write("X-Later-Retry-Attempts", attempts);

            // bail out if no attempts remaining
            if (!attempts) return done();

            // send request
            send(req, function(err, res) {
                later.emit("response", err || res, req);

                // done if no attempts are left
                if (!--attempts) return done();

                // re-queue for next attempt
                write("X-Later-Retry-Attempts", attempts);
                later.storage.queue(req, function(key) {
                    later.emit("retry", req);
                    done();
                });
            })
        }

        // kick off the unqueue
        setTimeout(function() {
            later.emit("refill");
            unqueue();
        }, refillBackoff[0]);
    }

    // nothing to do if there's already a queue going
    if (this.queue) return;

    // create queue
    prop.value(this, "queue", this.createQueue());

    // on queue drain, refill queue
    this.queue.drain = function() {
        later.emit("drain");

        // queue a task to refill the queue
        later.queue.push(refill, function(err) {
            if (err) later.emit("error", err);
        });
    };

    // kick off queue processing
    this.queue.push(function(done) {
        later.emit("replay");    
        done();
    });
};

/**
 * Add an accept rule.
 * @param {object} rule
 * @param {string} [rule.host]      virtual host to accept
 * @param {number} [rule.port]      listen port (if not default)
 * @param {string} [rule.path]      path prefix to handle; 404 on rest
 * @param {object} [rule.tls]       TLS options; https defaults to port 443
 * @param {string} [rule.tls.pfx]   path to key-pair/ca file
 * @param {string} [rule.tls.cert]  path of TLS cert file
 * @param {string} [rule.tls.key]   path of TLS private key file
 * @param {string} [rule.tls.ca]    path of TLS CA cert file
 */
LaterServer.prototype.accept = function(rule) {
    var host,
        port;

    host = {opts: rule};
    host.httpServer = host.opts.tls
        ? https.createServer(host.opts.tls, this.loadApplication())
        : http.createServer(this.loadApplication());

    port = host.opts.port || (host.opts.tls ? 443 : 80);
    host.httpServer.listen(port, this.emit.bind(this, "listening", host));

    this.hosts.push(host);
    this.accepts.push(host.opts);
};

/** export LaterServer class */
module.exports = LaterServer;
