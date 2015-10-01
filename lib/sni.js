/**
 * Create suitable SNI callback for server.
 * @param {Later} later
 * @returns {function}
 */
function sni(later) {
    return function(servername, done) {
        var rule = later.accepts.filter(function(rule) {
                return rule.tls && rule.host === servername;
            }).shift();

        done(null, rule.tls);
    };
}

/** export the sni function */
module.exports = sni;
