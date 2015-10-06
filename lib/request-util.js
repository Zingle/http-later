var concussion = require("concussion"),
    sha1 = require("crypto").createHash.bind(null, "sha1");

/**
 * Read the X-Later-Retry-On header.
 * @param {Request} req
 * @returns {number[]}
 */
function retryOn(req) {
    var headers = concussion(req.headers),
        retryOn = headers.read("X-Later-Retry-On");

    return retryOn ? retryOn.split(",").map(parseInt) : [];
}

/**
 * Return the number of attempts remaining for the request.
 * @param {Request} req
 * @returns {number}
 */
function attempts(req) {
    var headers = concussion(req.headers),
        attempts = headers.read("X-Later-Attempts");

    attempts = attempts ? parseInt(attempts) : 1;
    return attempts > 0 ? attempts : 0;
}

/**
 * Decrement the number of attempts remaining for the request.
 * @param {Request} req
 */
function useAttempt(req) {
    var remaining = attempts(req) - 1;
    if (remaining < 0) remaining = 0;
    concussion.write(req.headers, "X-Later-Attempts", remaining);
}

/**
 * Return true if the response was successful according to the request headers.
 * @param {Request} req
 * @param {Response|Error} res
 * @returns {boolen}
 */
function success(req, res) {
    return res instanceof Error
        ? false
        : retryOn(req).indexOf(res.statusCode) < 0;
}

/**
 * Return true if the request is for the future.
 * @param {object} req
 * @returns {boolean}
 */
function future(req) {
    var headers = concussion(req.headers),
        date = headers.read("Date");

    // no date header; can't be future
    if (!date) return false;

    // parse date; reject invalid dates
    date = new Date(date);
    if (isNaN(date.getTime())) return false;

    // compare to current date
    return date > new Date();
}

/**
 * Invoke request callback with response.
 * @param {Request} req
 * @param {Response|Error} res
 * @param {function} [done]
 */
function callback(req, res, done) {
    var headers = concussion(req.headers),
        data = res instanceof Error
            ? {req: req, err: res}
            : {req: req, res: res};

    // check for and execute callback
    if (headers.read("X-Later-Callback")) {
        request.post({
            url: headers.read("X-Later-Callback"),
            json: data
        }, function(err) {
            done(err, data);
        });
    }

    // or just call done
    else done && done();
}

/**
 * Hash request.
 * @param {Request} req
 * @returns {string}
 */
function hash(req, done) {
    var hash = sha1();
    hash.update(JSON.stringify(req));
    return hash.digest("hex");
}

/**
 * Format serialized request for logging.
 * @param {object} req
 * @returns {string}
 */
function formatLog(req) {
    return formatKey(req) + " " + formatHostLine(req) + " "
        + formatBody(req);
}


/** export utility functions */
module.exports = {
    retryOn: retryOn,
    attempts: attempts,
    useAttempt: useAttempt,
    success: success,
    future: future,
    callback: callback,
    hash: hash,
    formatLog: formatLog
};

/**
 * Format serialized request as key.
 * @param {object} req
 * @returns {string}
 */
function formatKey(req) {
    return concussion.read(req.headers, "X-Later-Key") || "<nokey>";
}

/**
 * Format serialized request as URL.
 * @param {object} req
 * @returns {string}
 */
function formatUrl(req) {
    var scheme = concussion.read(req.headers, "X-Later-TLS") === "insecure"
            ? "http"
            : "https",
        forward = concussion.read(req.headers, "X-Later-Host"),
        host = forward || concussion.read(req.headers, "Host");

    return scheme + "://" + host + req.url;
}

/**
 * Format serialized request as HTTP request line.
 * @param {object} req
 * @returns {string}
 */
function formatLine(req) {
    return req.method + " " + req.url + " HTTP/" + req.httpVersion;
}

/**
 * Format serialized request like HTTP request line, but with full URL
 * @param {object} req
 * @returns {string}
 */
function formatHostLine(req) {
    return req.method + " " + formatUrl(req) + " HTTP/" + req.httpVersion;
}

/**
 * Format serialized request as body shorthand
 * @param {object} req
 * @returns {string}
 */
function formatBody(req) {
    var len = req.body ? req.body.length : 0,
        type = concussion.read(req.headers, "Content-Type");

    return "{" + (type || "<notype>") + "[" + len + "]}";
}

/**
 * @typedef {object} Request
 * @property {string} method
 * @property {string} url
 * @property {string} httpVersion
 * @property {object} headers
 * @property {string} body
 */

/**
 * @typedef {object} Response
 * @property {string} httpVersion
 * @property {number} statusCode
 * @property {string} statusMessage
 * @property {object} headers
 * @property {string} body
 */

