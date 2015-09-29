/**
 * Write header on headers object, overwriting existing value if set.  Casing
 * is preserved if the header is already set.
 * name is already set.
 * @param {object} headers
 * @param {string} name
 * @param {string} value
 */
function writeHeader(headers, name, value) {
    var normal = name.toLowerCase();

    for (var prop in headers) {
        if (prop.toLowerCase() === normal) {
            headers[prop] = value;
            return;
        }
    }

    headers[name] = value;
}

/**
 * Read header from headers object.
 * @param {object} headers
 * @param {string} name
 * @returns {string}
 */
function readHeader(headers, name) {
    var normal = name.toLowerCase();

    for (var prop in headers) {
        if (prop.toLowerCase() === normal) {
            return headers[prop];
        }
    }

    return undefined;
}

/**
 * Remove header from headers object.
 * @param {object} headers
 * @param {string} name
 */
function removeHeader(headers, name) {
    var normal = name.toLowerCase();

    for (var prop in headers) {
        if (prop.toLowerCase() === normal) {
            delete headers[prop];
            return;
        }
    }
}

/**
 * Remove hop-by-hop headers.
 * q.v., http://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html#sec13.5.1
 * @param {object} headers
 */
function clearHopHeaders(headers) {
    ["Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization",
        "TE", "Trailers", "Transfer-Encoding", "Upgrade"]
        .forEach(removeHeader.bind(null, headers));
}

/** export functions */
module.exports = {
    write: writeHeader,
    read: readHeader,
    remove: removeHeader,
    clearHops: clearHopHeaders
};
