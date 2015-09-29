var cat = require("concat-stream");

/**
 * Serialize an incoming message and pass the serialized object to the
 * callback.
 * @param {IncomingMessage} req
 * @param {function} done
 */
function serializeIncoming(req, done) {
    var serialized = {},
        name;

    serialized.httpVersion = req.httpVersion;
    serialized.method = req.method;
    serialized.url = req.url;

    // serialize headers
    serialized.headers = {};
    for (name in req.headers) {
        // skip transfer-encoding which is not relevant once stored
        if (name.toLowerCase() === "transfer-encoding") continue;

        // skip content-length which will be set based on body
        if (name.toLowerCase() === "content-length") continue;

        // copy header
        serialized.headers[name] = req.headers[name];
    }

    // serialize body
    req.pipe(cat({encoding: "string"}, function(body) {
        serialized.body = body;
        serialized.headers["Content-Length"] = body.length;
        done(null, serialized);
    }));
}

/** export function */
module.exports = serializeIncoming;
