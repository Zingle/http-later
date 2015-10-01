var express = require("express");

/**
 * Create HTTP Later Express.js application using Later server and middleware.
 * configuration.
 * @param {Later} later
 * @param {function} middleware
 * @returns {function}
 */
function application(later, middleware) {
    var app = express();

    app.all("*", middleware);

    // decorate incoming requests so they have access to rules
    return function(req, res, next) {
        req.later = later;
        app(req, res, next);
    };
}

/** export the application function */
module.exports = application;
