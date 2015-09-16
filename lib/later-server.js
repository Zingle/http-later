var later = require(".."),
    forward = require("./forward-event"),
    EventEmitter = require("events").EventEmitter,
    Promise = require("es6-promise").Promise,
    https = require("https"),
    http = require("http"),
    fs = require("fs"),
    express = require("express"),
    prop = require("propertize"),
    resolve = require("path").resolve,
    cat = require("concat-stream"),
    request = require("request");

// ensure color support enabled
require("colors");

/**
 * HTTP later server object.
 * @constructor
 * @augments {EventEmitter}
 * @param {object} [opts]
 * @param {string} [opts.tlsDir]
 */
function LaterServer(opts) {
    EventEmitter.call(this);

    prop.internal(this, "servers", []);
    prop.internal(this, "tlsDir", opts.tlsDir);
    prop.internal(this, "storage", opts.storage);

    /**
     * @name LaterServer#express
     * @type {function}
     * @readonly
     */
    prop.readonly(this, "express", express());    

    // forward Express app events to this object
    forward("connection", this.express, this);
    forward("error", this.express, this);
    forward("request", this.express, this);
    forward("checkContinue", this.express, this);
    forward("connect", this.express, this);
    forward("upgrade", this.express, this);
    forward("clientError", this.express, this);

    // setup Express app
    this.express.all("*", this.createMiddleware());
}

LaterServer.prototype = Object.create(EventEmitter.prototype);
LaterServer.prototype.constructor = LaterServer;

/**
 * Create a server object.
 * @param {object} [opts]
 * @param {string} [opts.tlsDir]
 */
LaterServer.create = function(opts) {
    return new LaterServer(opts);
};

/**
 * Return true if the request method is allowed.
 * @param {http.IncomingMessage} req
 * @param {object} req.later
 * @param {string} [req.later.method]
 * @param {string} [req.later.methods]
 * @returns {boolean}
 */
LaterServer.prototype.methodAllowed = function(req) {
    var methods;

    if (req.later.methods) methods = req.later.methods.split(":");
    else if (req.later.method) methods = [req.later.method];
    
    if (methods) return methods.indexOf(req.method) >= 0;
    return true;
};

/**
 * Return true if the request path is acceptable.
 * @param {http.IncomingMessage} req
 * @param {object} req.later
 * @param {string} [req.later.path]
 * @param {string} [req.later.paths]
 * @returns {boolean}
 */
LaterServer.prototype.pathAcceptable = function(req) {
    var paths;

    if (req.later.paths) paths = req.later.paths.split(":");
    else if (req.later.path) paths = [req.later.path];

    if (paths) return paths.some(function(path) {
        return req.path.substr(0, path.length) === path;
    });

    return true;
};

/**
 * Begin replaying queued requests.
 */
LaterServer.prototype.replay = function() {
    var later = this,
        storage = this.storage,
        unqueued = 0,
        backoff = [1,1];

    this.emit("replay");

    function replay() {
        storage.unqueue(function(err, req) {
            var delay;

            if (err) {
                later.emit("error", err.message);
            } else if (req) {
                later.deserialize(req).then(function(res) {
                    later.emit("response", res, req);
                }).catch(function(err) {
                    later.emit("error", err.message);
                });
                
                unqueued++;
                replay();
            } else {
                later.emit("drain");

                // if requests were unqueued, restart replay
                if (unqueued) later.replay();

                // if there were no requests, apply backoff
                else {
                    later.emit("backoff");
                    backoff.push(backoff[0] + backoff[1]);
                    backoff.shift();
                    delay = backoff[1];
                    setTimeout(replay, delay);
                }
            }
        });
    }

    // initiate replay
    setTimeout(replay, 0);
};

/**
 * Begin accepting requests into queue.
 * @param {object} opts
 * @param {string} [opts.host]      virtual host to accept
 * @param {number} [opts.port]      listen port (if not default)
 * @param {string} [opts.path]      path prefix to handle; 404 on rest
 * @param {object} [opts.tls]       TLS options; https defaults to port 443
 * @param {string} [opts.tls.pfx]   path to key-pair/ca file
 * @param {string} [opts.tls.cert]  path of TLS cert file
 * @param {string} [opts.tls.key]   path of TLS private key file
 * @param {string} [opts.tls.ca]    path of TLS CA cert file
 */
LaterServer.prototype.accept = function(opts) {
    var later = this,
        name,
        host, port,
        server;

    // wrap Express listener so req is decorated with accept opts
    function option(opts, listener) {
        return function(req, res, next) {
            req.later = opts;
            return listener(req, res, next);
        };
    }

    // read in any TLS files
    if (opts.tls) {
        for (name in opts.tls) {
            opts.tls[name] = readFileSync(opts.tls[name], this.tlsDir);
        }
    }

    // create new server
    server = opts.tls
        ? https.createServer(opts.tls, option(opts, this.express))
        : http.createServer(option(opts, this.express));
    server.laterOpts = opts;
    this.servers.push(server);

    host = opts.host;
    port = opts.port || (opts.tls ? 443 : 80);

    server.on("listening", function() {
        later.emit("listening", server);
    });
    
    if (host) server.listen(port, host);
    else server.listen(port);
};

/**
 * Serialize a request.
 * @param {http.IncomingMessage} req
 * @returns {Promise}
 */
LaterServer.prototype.serialize = function(req) {
    var serialized = {},
        needLen = true,
        name;

    serialized.httpVersion = req.httpVersion;
    serialized.method = req.method;
    serialized.url = req.url;

    // serialize headers
    serialized.headers = {};
    for (name in req.headers) {
        // skip transfer-encoding which is not relevant once stored
        if (name.toLowerCase() === "transfer-encoding") continue;

        // track if content-length has been set
        if (name.toLowerCase() === "content-type") needLen = false;

        // copy header
        serialized.headers[name] = req.headers[name];
    }

    // serialize body, wrap in Promise and return
    return new Promise(function(resolve, reject) {
        req.pipe(cat({encoding: "string"}, function(body) {
            serialized.body = body;
            if (needLen) serialized.headers["Content-Length"] = body.length;
            resolve(serialized);
        }));
    });
};

/**
 * Deserialize a request.
 * @param {object} req
 * @returns {Promise}
 */
LaterServer.prototype.deserialize = function(req) {
    var url, name, host, laterHost,
        opts, deserialized,
        scheme = "https";

    // find host header
    for (name in req.headers) {
        switch (name.toLowerCase()) {
            case "host":
                host = req.headers[name];
                delete req.headers[name];
                break;

            case "x-later-host":
                laterHost = req.headers[name];
                delete req.headers[name];
                break;

            case "x-later-plain":
                scheme = "http";
                delete req.headers[name];
                break;
        }
    }

    // build request opts
    if (laterHost && host) req.headers["X-Later-Server"] = host;
    req.headers["Host"] = laterHost || host;
    url = scheme + "://" + req.headers["Host"] + req.url;
    opts = {method: req.method, headers: req.headers, uri: url};
    
    // make request and wrap in Promise result
    return new Promise(function(resolve, reject) {
        deserialized = request(opts, function(err, res, body) {
            var deserialized = {};

            if (err) reject(err);
            else {
                deserialized.httpVersion = res.httpVersion;
                deserialized.headers = res.headers;
                deserialized.statusCode = res.statusCode;
                deserialized.statusMessage = res.statusMessage;
                deserialized.body = body;
                resolve(deserialized);
            }
        });

        // write request body
        if (req.body) {
            deserialized.write(req.body);
            deserialized.end();
        }        
    });
};

/**
 * Store a request.  Return a Promise which resolves to the storage key.
 * @param {http.IncomingMessage} req
 * @returns {Promise}
 */
LaterServer.prototype.store = function(req) {
    var storage = this.storage;

    return this.serialize(req).then(function(req) {
        return new Promise(function(resolve, reject) {
            storage.queue(req, function(err, key) {
                if (err) reject(err);
                else resolve(key);
            });
        });
    });
};

/**
 * Stop the server from accepting new conections.
 * @param {function} [callback]
 */
LaterServer.prototype.close = function(callback) {
    var later = this,
        closing = this.servers.splice(0, this.servers.length);

    // add listener
    if (callback) this.on("close", callback);

    // for each closing server
    closing.forEach(function(server) {
        // close the server
        server.close(function() {
            // remove server from list
            var index = closing.indexOf(server);
            if (index >= 0) {
                closing.splice(index, 1);

                // emit close event once all servers are closed
                if (closing.length === 0) {
                    later.emit("close");
                }
            }
        });
    });
};

/**
 * Create Express middleware for this server.
 * @returns {function}
 */
LaterServer.prototype.createMiddleware = function() {
    var later = this;

    return function(req, res) {
        var opts = req.later;

        if (!later.pathAcceptable(req)) {
            res.writeHead(404, {"Content-Type": "text/plain"});
            res.end("Not Found");
            later.emit("request", res, req);
        }

        else if (!later.methodAllowed(req)) {
            res.writeHead(405, {
                "Allow": (opts.methods || opts.method).replace(":", ","),
                "Content-Type": "text/plain"
            });
            res.end("Method Not Allowed");
            later.emit("request", res, req);
        }

        // accept anything else
        else {
            later.store(req)
            .then(function(key) {
                res.writeHead(202, {"X-Later-Key": key});
                res.end();
                later.emit("request", res, req);
            })
            .catch(function(err) {
                res.writeHead(500, {"Content-Type": "text/plain"});
                res.end("Internal Server Error: " + err.message);
                later.emit("request", res, req);
            });
        }
    };
};

/**
 * Synchronously read a file relative to an optional base directory.
 * @param {string} path
 * @param {string} [base]
 * @returns {string}
 */
function readFileSync(path, base) {
    if (base) path = resolve(base, path);
    return fs.readFileSync(path);
}

/** export LaterServer class */
module.exports = LaterServer;
