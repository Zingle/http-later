var EventEmitter = require("events").EventEmitter,
    express = require("express"),
    prop = require("propertize"),
    later = require(".."),
    forward = require("./forward-event");

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

    prop.readonly(this, "express", express());
    prop.readonly(this, "servers", []);

    // forward Express app events to this object
    forward("connection", this.express, this);
    forward("error", this.express, this);
    forward("request", this.express, this);
    forward("checkContinue", this.express, this);
    forward("connect", this.express, this);
    forward("upgrade", this.express, this);
    forward("clientError", this.express, this);
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

/** export LaterServer class */
module.exports = LaterServer;
