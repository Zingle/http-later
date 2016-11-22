var cat = require("concat-stream");

/**
 * Serialize an incoming message and pass the serialized object to the
 * callback.
 * @param {IncomingMessage} req
 * @param {function} done
 */
function serializeIncoming(req, done) {
    var serialized = {},
        name, tls;

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

        // check if replay should force TLS/no-TLS
        if (name.toLowerCase() === "x-later-tls") {
            if (!tls && !httpsonly && req.headers[name] === "insecure") tls = false;
            else if (req.headers[name] === "secure" || httpsonly) tls = true;

            // skip this header; normalized value written below
            continue;
        }

        // copy header
        serialized.headers[name] = req.headers[name];
    }

    // always add X-Later-TLS header
    if (tls === undefined) tls = !!req.socket.encrypted || httpsonly;
    serialized.headers["X-Later-TLS"] = tls ? "secure" : "insecure";

    // serialize body
    req.pipe(cat({encoding: "string"}, function(body) {
        serialized.body = body;
        serialized.headers["Content-Length"] = body.length;
        done(null, serialized);
    }));
}

/** export function */
module.exports = serializeIncoming;
