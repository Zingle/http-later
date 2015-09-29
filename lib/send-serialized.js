var headers = require("./headers"),
    request = require("request");

/**
 * Send a serialized request, and pass serialized response to callback.
 * @param {object} req
 * @param {string} req.method
 * @param {string} req.url
 * @param {string} req.httpVersion
 * @param {object} req.headers
 * @param {string} req.body
 * @param {function} done
 */
function sendSerialized(req, done) {
    var opts = {}, scheme,
        readHeader = headers.read.bind(null, req.headers),
        writeHeader = headers.write.bind(null, req.headers),
        removeHeader = headers.remove.bind(null, req.headers),
        clearHopHeaders = headers.clearHops.bind(null, req.headers);

    // remove hop-by-hop headers
    clearHopHeaders();

    // handle x-later-host
    if (readHeader("X-Later-Host")) {
        writeHeader("X-Later-Server", readHeader("Host"));
        writeHeader("Host", readHeader("X-Later-Host"));
        removeHeader("X-Later-Host");
    }

    // check for x-later-insecure header
    scheme = readHeader("X-Later-Insecure") ? "http" : "https";

    // build request opts
    opts.method = req.method;
    opts.headers = req.headers;
    opts.uri = scheme + "://" + readHeader("Host") + req.url;
    
    request(opts, function(err, res, body) {
        var serialized = {},
            retryOn,
            status;

        if (err) done(err);
        else {
            serialized.httpVersion = res.httpVersion;
            serialized.headers = res.headers;
            serialized.statusCode = res.statusCode;
            serialized.statusMessage = res.statusMessage;
            serialized.body = body;
            done(null, serialized);
        }
    }).write(req.body).end();
}

/** export function */
module.exports = sendSerialized;
