var prop = require("propertize");

/**
 * Descriptor for Later server accept rule.
 * @constructor
 * @param {object} opts
 * @param {number} [opts.port]                  listen port
 * @param {string|undefined} [opts.host]        listen host
 * @param {string|undefined} [opts.path]        servable URL path prefix
 * @param {string|undefined} [opts.method]      acceptable HTTP method
 * @param {string|undefined} [opts.forward]     forward host on replay
 * @param {object|boolean} [opts.tls]           TLS options
 * @param {string|Buffer} [opts.tls.pfx]        combined certificate
 * @param {string|Buffer} [opts.tls.cert]       public certificate
 * @param {string|Buffer} [opts.tls.key]        certificate private key
 * @param {array|string|Buffer} [opts.tls.ca]   intermediate certs
 * @param {boolean} [opts.httpsonly]            ugrade insecure request to secure ones
 */
function AcceptRule(opts) {
    var rule = this;

    this.host = opts.host ? String(opts.host) : undefined;
    this.path = opts.path ? String(opts.path) : undefined;
    this.method = opts.method ? String(opts.method) : undefined;
    this.port = Number(opts.port) > 0 ? Number(opts.port) : 0;
    this.forward = opts.forward ? String(opts.forward) : undefined;
    this.tls = opts.tls || false;
    this.httpsonly = !!opts.httpsonly;

    if (!this.port) this.port = this.tls ? 443 : 80;

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
 * @param {string} [rule.host]
 * @param {string} [rule.forward]
 * @param {string} [rule.method]
 * @param {string[]} [rule.methods]
 * @param {string} [rule.path]
 * @param {string[]} [rule.paths]
 * @param {object} [rule.tls]
 * @param {boolean} [rule.httpsonly]
 * @returns {AcceptRule[]}
 */
AcceptRule.readAcceptRule = function(rule) {
    var results = [],
        opts,
        paths = rule.paths instanceof Array ? rule.paths.slice() : [],
        methods = rule.methods instanceof Array ? rule.methods.slice() : [],
        tls = AcceptRule.readTLSOption(rule.tls),
        port = parseInt(rule.port);
        httpsonly = rule.httpsonly;

    if (!(port > 0)) port = tls ? 443 : 80;
    if (typeof rule.path === "string") paths.push(rule.path);
    if (typeof rule.method === "string") methods.push(rule.method);

    if (paths.length === 0) paths.push(undefined);
    if (methods.length === 0) methods.push(undefined);

    paths.forEach(function(path) {
        methods.forEach(function(method) {
            opts = {};
            opts.host = rule.host;
            opts.forward = rule.forward;
            opts.path = path;
            opts.method = method;
            opts.tls = tls;
            opts.port = port;
            opts.httpsonly = !!httpsonly;

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
    var stdPort = this.tls ? 443 : 80,
        scheme = this.tls || this.httpsonly ? "https" : "http",
        host = this.host || "<any>",        
        port = this.port === stdPort ? "" : ":" + this.port,
        path = this.path || "/",
        method = this.method ? this.method + " " : "";

    return method + scheme + "://" + host + port + path;
};

/**
 * Check the request host against this rule and return true if it mathches.
 * @param {http.IncomingMessage} req
 * @returns {boolean}
 */
AcceptRule.prototype.checkHost = function(req) {
    return !this.host || this.host === req.headers.host.split(':')[0];
};
 
/**
 * Check the request path against this rule and return true if it mathches.
 * @param {http.IncomingMessage} req
 * @returns {boolean}
 */
AcceptRule.prototype.checkPath = function(req) {
    return !this.path || req.url.substr(0, this.path.length) === this.path;
};

/**
 * Check the request method against this rule and return true if it mathches.
 * @param {http.IncomingMessage} req
 * @returns {boolean}
 */
AcceptRule.prototype.checkMethod = function(req) {
    return !this.method || this.method === req.method;
};

/** export AcceptRule class */
module.exports = AcceptRule;
