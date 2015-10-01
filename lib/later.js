var middleware = require("./middleware"),
    application = require("./application"),
    send = require("./send-serialized"),
    headers = require("./headers"),
    httpish = require("./httpish"),
    queue = require("async").queue,
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
 * @typedef {object} Listener
 * @property {number} port
 * @property {boolean} secure
 */

/**
 * @typedef {object} Storage
 */

/**
 * @name Storage#queue
 * @method
 * @param {object} task
 * @param {queueCallback} done
 */

/**
 * @name Storage#unqueue
 * @method
 * @param {unqueueCallback} done
 */

/**
 * @name Storage#log
 * @method
 * @param {string} key
 * @param {object} result
 * @param {doneCallback} done

/**
 * Queue task callback
 * @callback queueCallback
 * @param {Error} err
 * @param {string} key
 */

/**
 * Unqueue task callback
 * @callback unqueueCallback
 * @param {Error} err
 * @param {object} task
 * @param {string} key
 */

/**
 * Basic async callback
 * @callback doneCallback
 * @param {Error} err
 */

/**
 * HTTP later server object.
 * @constructor
 * @augments {EventEmitter}
 * @param {object} opts
 * @param {Storage} opts.storage
 */
function Later(opts) {
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
    prop.internal(this, "httpish", httpish.createServer(opts.tls));

    this.httpish.on("request", application(this, middleware(this)));

    /**
     * @name Later#storage
     * @type {Storage}
     * @readonly
     */
    prop.readonly(this, "storage", opts.storage);

    /**
     * @name Later#accepts
     * @type {Accept[]}
     * @readonly
     */
    prop.readonly(this, "accepts", opts.accepts);

    /**
     * @name Later#methods
     * @type {string[]|undefined}
     * @readonly
     */
    prop.readonly(this, "methods", opts.methods);

    /**
     * @name Later#paths
     * @type {string[]|undefined}
     * @readonly
     */
    prop.readonly(this, "paths", opts.paths);
}

Later.prototype = Object.create(EventEmitter.prototype);
Later.prototype.constructor = Later;

/**
 * Create a server object.
 * @param {object} opts
 * @param {Storage} opts.storage
 * @param {Accept[]} [opts.accepts]
 */
Later.create = function(opts) {
    return new Later(opts);
};

/**
 * Create replay queue.
 * @returns {object}
 */
Later.prototype.createQueue = function() {
    var worker;

    // create a queue which accepts node-style async tasks
    worker = function(task, done) {task(done);};
    return queue(worker, this.concurrency || 20);
};

/**
 * Begin replaying queued requests.
 */
Later.prototype.replay = function() {
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

            later.storage.unqueue(function(err, req, key) {
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
                later.storage.queue(req, function(err, key) {
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
Later.prototype.accept = function(rule) {
    var host, httpishArgs;

    if (rule.port) rule.port = parseInt(rule.port);

    host = rule.host || "";
    if (rule.tls && rule.port) httpishArgs = [rule.tls, rule.port, host];
    else if (rule.tls) httpishArgs = [rule.tls, host];
    else if (rule.port) httpishArgs = [rule.port, host];
    else httpishArgs = [host];
    this.httpish.listen.apply(this.httpish, httpishArgs);
};

/** export Later class */
module.exports = Later;
