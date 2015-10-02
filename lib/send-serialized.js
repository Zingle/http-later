var concussion = require("concussion"),
    request = require("request"),
    retryable = require("retryable");

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
        headers = concussion(req.headers);

    // remove hop-by-hop headers
    ["Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization",
        "TE", "Trailers", "Transfer-Encoding", "Upgrade"]
        .forEach(headers.remove);

    // handle x-later-host
    if (headers.read("X-Later-Host")) {
        headers.write("X-Later-Server", headers.read("Host"));
        headers.write("Host", headers.read("X-Later-Host"));
        headers.remove("X-Later-Host");
    }

    // check for x-later-insecure header
    scheme = headers.read("X-Later-Insecure") ? "http" : "https";

    // build request opts
    opts.method = req.method;
    opts.headers = req.headers;
    opts.uri = scheme + "://" + headers.read("Host") + req.url;

    retryable(function(opts, done) {
        var stream = request(opts, done);
        stream.write(req.body);
        stream.end();
    }).retry(4).backoff(function() {   // calibrated to about 30 mins
        this.data = this.data || [0, 1000];
        this.data.push(this.data[0] + this.data[1]);
        return this.data.shift();
    })(opts, function(err, res, body) {
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
    });
}

/** export function */
module.exports = sendSerialized;
