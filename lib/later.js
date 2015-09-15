var LaterStorage = require("./later-storage"),
    http = require("http");

/**
 * Create Express middleware to accept incoming messages and store them in a
 * queue.
 * @param {LaterStorage} storage
 */
function createMiddleware(storage) {

    /**
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     * @param {function} next
     */
    return function(req, res, next) {

    };

}