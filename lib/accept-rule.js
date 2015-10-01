var prop = require("propertize");

/**
 * Descriptor for Later server accept rule.
 * @constructor
 * @param {object} opts
 * @param {string} [opts.host]
 * @param {number} [opts.port]
 * @param {string} [opts.path]
 * @param {string} [opts.method]
 * @param {object} [opts.tls]
 * @param {string|Buffer} [opts.tls.pfx]
 * @param {string|Buffer} [opts.tls.cert]
 * @param {string|Buffer} [opts.tls.key]
 * @param {array|string|Buffer} [opts.tls.ca]
 */
function AcceptRule(opts) {
    var rule = this;

    this.host = opts.host;
    this.port = opts.port;
    this.path = opts.path;
    this.method = opts.method;
    this.tls = opts.tls;

    /**
     * @name AcceptRule#host
     * @type {string|undefined}
     * @readonly
     */
    prop.readonly(this, "host");

    /**
     * @name AcceptRule#port
     * @type {number}
     * @readonly
     */
    prop.readonly(this, "port");

    /**
     * @name AcceptRule#path
     * @type {string|undefined}
     * @readonly
     */
    prop.readonly(this, "path");

    /**
     * @name AcceptRule#method
     * @type {string|undefined}
     * @readonly
     */
    prop.readonly(this, "method");

    /**
     * @name {AcceptRule#tls}
     * @type {object|boolean}
     * @readonly
     */
    prop.readonly(this, "tls");

}

/**
 * Read a TLS options object into a normalized options object.
 * @param {object} tls
 * @param {string|Buffer} [tls.pfx]
 * @param {string|Buffer} [tls.cert]
 * @param {string|Buffer} [tls.key]
 * @param {array|string|Buffer} [tls.ca]
 * @returns {object|boolean}
 */
AcceptRule.readTLSOption = function(tls) {
    result = {};

    if (!tls) return false;

    function stringize(val) {
        return val instanceof Buffer ? val.toString("binary") : String(val);
    }

    if (tls.pfx) result.pfx = stringize(tls.pfx);
    if (tls.cert) result.cert = stringize(tls.cert);
    if (tls.key) result.key = stringize(tls.key);

    if (tls.ca instanceof Array) result.ca = tls.ca.slice();
    if (typeof tls.ca === "string") result.ca = [tls.ca];
    if (result.ca) result.ca = result.ca.map(stringize);

    return result;
};

/**
 * Read accept rule object into an array of AcceptRule instances.
 * @param {object} rule
 * @returns {AcceptRule[]}
 */
AcceptRule.readAcceptRule = function(rule) {
    var results = [],
        opts,
        host = rule.host ? String(rule.host) : undefined,
        paths = rule.paths instanceof Array ? rule.paths.slice() : [],
        methods = rule.methods instanceof Array ? rule.methods.slice() : [],
        tls = AcceptRule.readTLSOption(rule.tls),
        port = parseInt(rule.port);

    if (!(port > 0)) port = tls ? 443 : 80;
    if (typeof rule.path === "string") paths.push(rule.path);
    if (typeof rule.method === "string") methods.push(rule.method);

    if (paths.length === 0) paths.push(undefined);
    if (methods.length === 0) methods.push(undefined);

    paths.forEach(function(path) {
        methods.forEach(function(method) {
            opts = {};
            opts.host = host;
            opts.path = path;
            opts.method = method;
            opts.tls = tls;
            opts.port = port;

            results.push(new AcceptRule(opts));
        });
    });

    return results;
};

/**
 * Return string representation of rule.
 * @returns {string}
 */
AcceptRule.prototype.toString = function() {
    var scheme = this.tls ? "https" : "http",
        host = this.host || "<any>",
        stdPort = this.tls ? 443 : 80,
        port = this.port === stdPort ? "" : ":" + this.port,
        path = this.path || "/",
        method = this.method ? this.method + " " : "";

    return method + scheme + "://" + host + port + path;
};

/** export AcceptRule class */
module.exports = AcceptRule;
