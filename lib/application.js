var express = require("express"),
    http = require("http"),
    https = require("https");

/**
 * Create HTTP Later Express.js application using the LaterServer and middleware.
 * configuration.
 * @param {LaterServer} later
 * @param {function} middleware
 * @returns {function}
 */
function application(later, middleware) {
    var app = express();

    app.all("*", middleware);
    app.servers = [];
    
    // add server for each secure accept host
    later.accepts
        .filter(function(accept) {return accept.tls;})
        .forEach(function(accept) {
            var server = https.createServer(accept.tls, app),
                port = accept.port || 443;

            if (accept.host) server.listen(port, accept.host);
            else server.listen(port);

            app.servers.push(server);
        });

    // add another server for each insecure accept host
    later.accepts
        .filter(function(accept) {return !accept.tls;})
        .forEach(function(accept) {
            var server = http.createServer(app),
                port = accept.port || 80;

            if (accept.host) server.listen(port, accept.host);
            else server.listen(port);

            app.servers.push(server);
        });

    // decorate incoming requests so they have access to rules
    return function(req, res, next) {
        req.later = later;
        app(req, res, next);
    };
}

/** export the application function */
module.exports = application;
