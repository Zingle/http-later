var middleware = require("./middleware"),
    application = require("./application"),
    send = require("./send-serialized"),
    sni = require("./sni"),
    http = require("http"),
    https = require("httpolyglot"),
    request = require("request"),
    queue = require("async").queue,
    AcceptRule = require("./accept-rule"),
    EventEmitter = require("events").EventEmitter,
    concussion = require("concussion"),
    forward = require("event-emitter-forward"),
    prop = require("propertize");

// ensure color support enabled
require("colors");

/**
 * Return true if the request needs to be retried.
 * @param {object} req
 * @param {object} res
 * @returns {boolean}
 */
function needsRetry(req, res) {
    var headers = concussion(req.headers),
        retryOn;

    // error response should be retried
    if (res instanceof Error) return true;

    // if request has has no retry statuses, no need to retry
    retryOn = headers.read("X-Later-Retry-On");
    if (!retryOn) return false;

    // request with retry-on header should also be retried for those statuses
    retryOn = retryOn.split(",").map(parseInt);
    return retryOn.some(function(status) {
        return status === res.statusCode;
    });
}

/**
 * Return the number of attempts remaining for the request.
 * @param {object} req
 * @returns {number}
 */
function remainingAttempts(req) {
    var headers = concussion(req.headers),
        attempts = headers.read("X-Later-Attempts");

    attempts = attempts ? parseInt(attempts) : 1;
    return attempts > 0 ? attempts : 0;
}

/**
 * Invoke request callback with a response.
 * @param {object} req
 * @param {object} res
 */
function makeCallback(req, res) {
    var headers = concussion(req.headers),
        data = res instanceof Error
            ? {req: req, err: res}
            : {req: req, res: res};

    // check for callback
    if (headers.read("X-Later-Callback")) {
        request.post({
            url: headers.read("X-Later-Callback"),
            json: data
        });
    }
}

/**
 * HTTP later server object.
 * @constructor
 * @augments {EventEmitter}
 * @param {object} opts
 * @param {Storage} opts.storage
 * @param {object} [opts.tls]
 * @param {string|Buffer} [opts.tls.pfx]
 * @param {string|Buffer} [opts.tls.cert]
 * @param {string|Buffer} [opts.tls.key]
 * @param {array|string|Buffer} [opts.tls.ca]
 */
function Later(opts) {
    EventEmitter.call(this);

    opts.accepts = opts.accepts ? opts.accepts.slice() : [];
    opts.methods = opts.methods ? opts.methods.slice() : [];
    opts.paths = opts.paths ? opts.paths.slice() : [];

    if (opts.tls) opts.tls.SNICallback = sni(this);
    if (opts.methods.length === 0) opts.methods = undefined;
    if (opts.paths.length === 0) opts.paths = undefined;

    this.tls = opts.tls;
    this.secure = !!opts.tls;
    this.httpServer = this.secure
        ? https.createServer(opts.tls)
        : http.createServer();

    prop.internal(this, "queue");
    prop.internal(this, "tls");
    prop.internal(this, "secure");
    prop.internal(this, "httpServers", []);
    prop.internal(this, "httpServersByPort", {});

    /**
     * @name Later#application
     * @type {function}
     * @readonly
     */
    prop.readonly(this, "application", application(this, middleware(this)));

    /**
     * @name Later#storage
     * @type {Storage}
     * @readonly
     */
    prop.readonly(this, "storage", opts.storage);

    /**
     * @name Later#rules
     * @type {AcceptRule[]}
     * @readonly
     */
    prop.readonly(this, "rules", []);

}

Later.prototype = Object.create(EventEmitter.prototype);
Later.prototype.constructor = Later;

/**
 * Create a server object.
 * @param {object} opts
 * @param {Storage} opts.storage
 * @param {object} [opts.tls]
 * @param {string|Buffer} [opts.tls.pfx]
 * @param {string|Buffer} [opts.tls.cert]
 * @param {string|Buffer} [opts.tls.key]
 * @param {array|string|Buffer} [opts.tls.ca]
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
 * Find server listening on a port or start a new one.
 * @param {number} port
 * @returns {http.Server|https.Server}
 */
Later.prototype.portServer = function(port) {
    var later = this,
        app = this.application,
        server = this.httpServersByPort[String(port)];

    if (server) return server;
    else server = this.secure
        ? https.createServer(this.tls, app)
        : http.createServer(app);

    forward("error", this.httpServer, this);
    forward("connection", this.httpServer, this);
    forward("close", this.httpServer, this);
    forward("checkContinue", this.httpServer, this);
    forward("connect", this.httpServer, this);
    forward("upgrade", this.httpServer, this);
    forward("clientError", this.httpServer, this);

    server.listen(port, function() {
        later.emit("listening", server.address());
    });

    this.httpServers.push(server);
    this.httpServersByPort[String(port)] = server;
    return server;
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
                if (err) {
                    done(err);
                } else if (req) {
                    concussion.write(req.headers, "X-Later-Key", key);
                    later.emit("pull", req);
                    later.queue.push(tryRequest.bind(null, req, key));
                    unqueue();
                } else if (count === 1) {
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

        function tryRequest(req, key, done) {
            var headers = concussion(req.headers),
                attempts = remainingAttempts(req),
                retryOn = headers.read("X-Later-Retry-On");

            // bail out if no attempts remaining
            if (attempts === 0) return done();

            // add http-later key header
            headers.write("X-Later-Key", key);

            // send request
            later.emit("replay", req);
            send(req, function(err, res) {
                var retry = !!err;
                later.emit(err ? "failure" : "response", err || res, req);

                // log response to storage
                later.storage.log(key, err || res, function(err) {
                    if (err) later.emit("error", err);
                });

                // if response is acceptable, invoke callback with response
                if (!needsRetry(req, res)) {
                    makeCallback(req, res);
                }

                // if no attempts remain, invoke callback with result
                else if (--attempts === 0) {
                    makeCallback(req, err || res);
                }

                // make another attempt
                else {
                    // re-queue for next attempt
                    headers.write("X-Later-Attempts", attempts);
                    later.storage.queue(req, function(e, key) {
                        if (e) later.emit("error", e);
                        else later.emit("retry", req, err || res);
                    });
                }

                // done with request attempt
                done();
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
        later.emit("replaying");    
        done();
    });
};

/**
 * Add an accept rule.
 * @param {object} rule
 */
Later.prototype.accept = function(rule) {
    var later = this,
        rules = this.rules.map(String);

    // SNI requires default cert for clients without SNI support
    if (rule.tls && !this.secure) {
        this.emit("error", new Error("SNI fallback required to accept TLS"));
    }

    // cert must be bound to a host
    if (rule.tls && !rule.host) {
        this.emit("error", new Error("TLS requires host name"));
    }

    // normalize port
    rule.port = parseInt(rule.port);
    if (rule.port < 0 || !rule.port) rule.port = 0;
    rule.port = rule.port || (rule.tls ? 443 : 80);
    
    // ensure a server is started for the port
    this.portServer(rule.port);

    // expand rule, ensure no dupes, and emit accepting events
    AcceptRule.readAcceptRule(rule).forEach(function(rule) {
        var err;

        if (rules.indexOf(String(rule)) >0 ) {
            err = new Error("duplicate rule " + String(rule));
            later.emit("error", err);
        } else {
            rules.push(String(rule));
            later.rules.push(rule);
            later.emit("accepting", rule);
        }
    });
};

/** export Later class */
module.exports = Later;

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


