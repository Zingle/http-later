var concussion = require("concussion");

/**
 * Format serialized request as key.
 * @param {object} req
 * @returns {string}
 */
function requestKey(req) {
    return concussion.read(req.headers, "X-Later-Key") || "<nokey>";
}

/**
 * Format serialized request as URL.
 * @param {object} req
 * @returns {string}
 */
function requestUrl(req) {
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
function requestLine(req) {
    return req.method + " " + req.url + " HTTP/" + req.httpVersion;
}

/**
 * Format serialized request like HTTP request line, but with full URL
 * @param {object} req
 * @returns {string}
 */
function requestHostLine(req) {
    return req.method + " " + requestUrl(req) + " HTTP/" + req.httpVersion;
}

/**
 * Format serialized request as body shorthand
 * @param {object} req
 * @returns {string}
 */
function requestBody(req) {
    var len = req.body ? req.body.length : 0,
        type = concussion.read(req.headers, "Content-Type");

    return "{" + (type || "<notype>") + "[" + len + "]}";
}

/**
 * Format serialized request for logging.
 * @param {object} req
 * @returns {string}
 */
function requestLog(req) {
    return requestKey(req) + " " + requestHostLine(req) + " "
        + requestBody(req);
}

/** export log format functions */
module.exports = {
    request: requestLog
};
