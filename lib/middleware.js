var prefixed = require("./prefixed"),
    receive = require("./serialize-incoming");

/**
 * Create connect middleware using the LaterServer configuration.
 * @param {LaterServer} later
 * @returns {function}
 */
function later(later) {
    var LaterServer = require("./later-server");

    if (!(later instanceof LaterServer)) later = new LaterServer(later);

    return function(req, res) {
        var headers = {"Content-Type": "text/plain"};

        // 404 on invalid path
        if (!prefixed(req.url, later.paths)) {
            res.writeHead(404, headers);
            res.end("Not Found");
            later.emit("request", res, req);
        }

        // 405 on invalid method
        else if (later.methods && later.methods.indexOf(req.method) >= 0) {
            headers.Allow = later.methods.join(",");
            res.writeHead(405, headers);
            res.end("Method Not Allowed");
            later.emit("request", res, req);
        }

        // accept the rest
        else receive(req, function(err, req) {
            if (err) res.writeHead(500, headers).end(err.message);
            else later.storage.queue(req, function(key) {
                res.writeHead(202, {"X-Later-Key": key});
                res.end();
                later.emit("request", res, req);
            });
        });
    }
}

/** export the middleware function */
module.exports = later;
