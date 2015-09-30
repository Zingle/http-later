var EventEmitter = require("events").EventEmitter,
    http = require("http"),
    https = require("https"),
    tls = require("tls"),
    prop = require("propertize"),
    forward = require("event-emitter-forward"),
    headers = require("./headers");

/**
 * Open port information.
 * @constructor
 * @param {number} port
 * @param {object} [tlsopts]
 */
function Port(port, tlsopts) {
    port = parseInt(port);
    if (port < 0 || !port) throw new Error("invalid port number");

    EventEmitter.call(this);

    var instance = this,
        server = tlsopts
            ? https.createServer(tlsopts)
            : http.createServer();

    forward("error", server, this);
    forward("listening", server, this);
    forward("connection", server, this);
    forward("close", server, this);
    forward("checkContinue", server, this);
    forward("connect", server, this);
    forward("upgrade", server, this);
    forward("clientError", server, this);

    server.on("request", function(req, res) {
        var any = "" in instance.hosts;

        // decorate request with port info
        req.portinfo = instance;

        // 503 if not listening for requested host
        if (!any && !(req.headers.host in instance.hosts)) {
            res.writeHead(503, {"Content-Type": "text/plain"});
            res.end("Service Unavailable");
        }

        // forward event
        instance.emit("request", req, res);
    });

    // give caller a chance to hookup events by listening after next tick
    setTimeout(function() {
        server.listen(port);
    });

    /**
     * @name Port#port
     * @type {number}
     * @readonly
     */
    prop.readonly(this, "port", port);

    /**
     * @name Port#tls
     * @type {object}
     * @readonly
     */
    prop.readonly(this, "tls", tlsopts);

    /**
     * @name Port#secure
     * @type {boolean}
     * @readonly
     */
    prop.derived(this, "secure", function() {
        return !!this.tls;
    });

    /**
     * @name Port#hosts
     * @type {object}
     * @readonly
     */
    prop.readonly(this, "hosts", {});

    /**
     * @name Port#server
     * @type {http.Server|https.Server}
     * @readonly
     */
    prop.readonly(this, "server", server);

}

Port.prototype = Object.create(EventEmitter.prototype);
Port.prototype.constructor = Port;

/**
 * Update TLS cert for this port.
 * @param {object} tlsopts
 * @param {string|Buffer} [tlsopts.pfx]
 * @param {string|Buffer} [tlsopts.cert]
 * @param {string|Buffer} [tlsopts.key]
 * @param {array|string|Buffer} [tlsopts.ca]
 * @returns {Port}
 */
Port.prototype.updateTLS = function(tlsopts) {
    var err;

    if (this.tls && !tlsopts) {
        err = "port " + this.port + " requires TLS cert";
    } else if (!this.tls && tlsopts) {
        err = "cannot updgrade " + this.port + " with TLS cert";
    }

    if (err) throw new Error(err);
    prop.value(this, "tls", tlsopts);
    return this;
};

/**
 * Configure host for this port.  Falsey host will result in listening on
 * all hosts.  It is an error to specify other hosts more than once.
 * @param {string} host
 * @returns {Port}
 */
Port.prototype.host = function(host) {
    host = String(host);
    
    if (host && host in this.hosts) {
        throw new Error("host "+host+" already specified");
    }

    this.hosts[host] = this.tls;
    return this;
};

/**
 * Server object.  Internally wraps an http.Server with an https.Server.
 * @constructor
 * @param {object} [opts]
 * @param {string|Buffer} [opts.pfx]
 * @param {string|Buffer} [opts.cert]
 * @param {string|Buffer} [opts.key]
 * @param {array|string|Buffer} [opts.ca]
 * @param {function} [opts.SNICallback]
 */
function Server(opts) {
    var server = this;

    EventEmitter.call(this);

    /**
     * @name Server#ports
     * @type {Port[]}
     * @readonly
     */
    prop.readonly(this, "ports", []);
}

Server.prototype = Object.create(EventEmitter.prototype);
Server.prototype.constructor = Server;

/**
 * Return open port information.
 * @param {number} port
 * @returns {Port}
 */
Server.prototype.port = function(port) {
    return this.ports.filter(function(open) {
        return open.port === port;
    }).shift();
};

/**
 * Open a port.
 * @param {number} port
 * @param {object} [tlsopts]
 * @returns {Port}
 */
Server.prototype.open = function(port, tlsopts) {
    var existing = this.port(port);

    if (existing) {
        port = existing.updateTLS(tlsopts);
    } else {
        port = new Port(port, tlsopts);
        this.ports.push(port);
    }

    return port;
};

/**
 * Begin listening for requests.
 * @param {object} [opts]
 * @param {string|Buffer} [opts.pfx]
 * @param {string|Buffer} [opts.cert]
 * @param {string|Buffer} [opts.key]
 * @param {array|string|Buffer} [opts.ca]
 * @param {number} [port]
 * @param {string} [hostname]
 * @param {function} [callback]
 */
Server.prototype.listen = function(opts, port, host, done) {
    // handle optional args
    if (opts && typeof opts !== "object")
        done = host, host = port, port = opts, opts = null;
    if (typeof port !== "number")
        done = host, host = port, port = opts ? 443 : 80;
    if (typeof host === "function") done = host, host = null;

    // validate port
    if (port < 0 || !port) throw new TypeError("invalid port");

    // get open port and configure host
    port = this.open(port, opts).host(host);

    // forward port events to this server
    forward("error", port, this);
    forward("listening", port, this);
    forward("connection", port, this);
    forward("close", port, this);
    forward("checkContinue", port, this);
    forward("connect", port, this);
    forward("upgrade", port, this);
    forward("clientError", port, this);
    forward("request", port, this);

    // add event listener for 'listening' event
    if (done) port.on("listening", done);
};

/**
 * Create multi-protocol server.
 * @param {object} [opts]
 * @param {function} [requestListener]
 * @returns {Server}
 */
function createServer(opts, requestListener) {
    if (arguments.length < 2 && typeof opts === "function")
        requestListener = opts, opts = {};

    var server;

    opts = opts || {};
    server = new Server();
    if (requestListener) server.on("request", requestListener);
    return server;
}

// extend http module exports
module.exports = Object.create(http);

// override Server class and factory function
module.exports.Server = Server;
module.exports.createServer = createServer;

