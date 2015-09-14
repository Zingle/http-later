var EventEmitter = require("events").EventEmitter,
    Promise = require("es6-promise").Promise,
    express = require("express"),
    redis = require("redis"),
    sha1 = require("crypto").createHash.bind(null, "sha1"),
    prop = require("propertize"),
    cat = require("concat-stream"),
    later = require(".."),
    forward = require("./forward-event");

// ensure color support enabled
require("colors");

/**
 * HTTP later server object.
 * @constructor
 * @augments {EventEmitter}
 * @param {object} [opts]
 * @param {string[]} [opts.methods]
 * @param {string[]} [opts.hosts]
 * @param {string[]} [opts.paths]
 * @param {number} [opts.port]
 */
function LaterServer(opts) {
    EventEmitter.call(this);

    prop.internal(this, "servers", []);

    /**
     * @name LaterServer#methods
     * @type {string[]}
     * @readonly
     */
    prop.readonly(this, "methods", opts.methods || ["POST"]);

    /**
     * @name LaterServer#paths
     * @type {string[]}
     * @readonly
     */
    prop.readonly(this, "paths", opts.paths || []);

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
 * @param {string[]} [opts.methods]
 * @param {string[]} [opts.hosts]
 * @param {string[]} [opts.paths]
 * @param {number} [opts.port]
 */
LaterServer.create = function(opts) {
    return new LaterServer(opts);
};

/**
 * Return true if the method is allowed.
 * @param {string} method
 * @returns {boolean}
 */
LaterServer.prototype.methodAllowed = function(method) {
    // if no methods are defined, allow any method
    if (this.methods.length === 0) return true;

    // check if any of the methods match
    return this.methods.indexOf(method) >= 0;
};

/**
 * Return true if the path is acceptable.
 * @param {string} path
 * @returns {boolean}
 */
LaterServer.prototype.pathAcceptable = function(path) {
    // if no paths are defined, accept all paths
    if (this.paths.length === 0) return true;

    // check if any of the paths match
    return this.paths.some(function(base) {
        return path.substr(0, base.length) === base;
    });
};

/**
 * Begin replaying queued requests.
 */
LaterServer.prototype.replay = function() {
    console.info("replaying queued requests".cyan);    
    
    this.storage().then(function(storage) {
        storage.lpop("later:queue", function(err, key) {
            if (err) console.error(String(err.message).red);
            else storage.get(key, function(err, req) {
                if (err) console.error(String(err.message).red);
                else {
                    console.info(String(req || "<queue drained>").gray);
                }
            });
        });
    });
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
        req.pipe(cat(function(body) {
            serialized.body = body;
            if (needLen) serialized.headers["Content-Length"] = body.length;
            resolve(serialized);
        }));
    });
};

/**
 * Connect to storage.  Return a Promise which resolves to the connected
 * storage.
 * @returns {Promise}
 */
LaterServer.prototype.storage = function() {
    return new Promise(function(resolve, reject) {
        var connection = redis.createClient();
        resolve(connection);
    });
};

/**
 * Store a request.  Return a Promise which resolves to the storage key.
 * @param {http.IncomingMessage} req
 * @returns {Promise}
 */
LaterServer.prototype.store = function(req) {
    var connected = this.storage(),
        serialized = this.serialize(req);

    return Promise.all([connected, serialized]).then(function(args) {
        var hash, key,
            storage = args.shift(),
            req = args.shift();

        req = JSON.stringify(req);
        hash = sha1();
        hash.update(req);
        key = "later:" + hash.digest("hex");

        return new Promise(function(resolve, reject) {
            // first add the key to the queue
            storage.rpush("later:queue", key, function(err) {
                if (err) reject(err);

                // now store request data
                else storage.set(key, req, function(err) {
                    if (err) reject(err);
                    else resolve(key);
                });
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
 * Return the bound addresses.
 * @returns {object}
 */
LaterServer.prototype.address = function() {
    return this.servers.map(function(server) {
        return server.address();
    });
};

/**
 * Bind and listen for incoming requests on the specified host and port.
 * @param {number} port
 * @param {string} [hostname]
 * @param {number} [backlog]
 * @param {function} [callback]
 * @returns {Server}
 */
LaterServer.prototype.listen = function(port, hostname, backlog, callback) {
    var server;

    // extend callback to pass server address
    if (typeof arguments[arguments.length-1] === "function") {
        callback = arguments[arguments.length-1];
        arguments[arguments.length-1] = function() {
            callback(server.address());
        };
    }

    // create new server
    server = this.express.listen.apply(this.express, arguments);
    this.servers.push(server);
    return server;
};

/**
 * Create Express middleware for this server.
 * @returns {function}
 */
LaterServer.prototype.createMiddleware = function() {
    var later = this;

    return function(req, res) {
        if (!later.pathAcceptable(req.path)) {
            console.info(String(404).yellow + " " + req.path);
            res.writeHead(404, {"Content-Type": "text/plain"});
            res.end("Not Found");
        }

        else if (!later.methodAllowed(req.method)) {
            console.info(String(405).yellow + " " + req.method);
            res.writeHead(405, {
                "Allow": later.methods.join(","),
                "Content-Type": "text/plain"
            });
            res.end("Method Not Allowed");
        }

        // accept anything else
        else {
            later.store(req)
            .then(function(key) {
                res.writeHead(202, {"X-Key": key});
                res.end();
            })
            .catch(function(err) {
                res.writeHead(500, {"Content-Type": "text/plain"});
                res.end("Internal Server Error: " + err.message);
            });
        }
    };
};

/** export LaterServer class */
module.exports = LaterServer;
