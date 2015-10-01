/**
 * Create suitable SNI callback for server.
 * @param {Later} later
 * @returns {function}
 */
function sni(later) {
    return function(servername, done) {
        var rule = later.rules.filter(function(rule) {
                return rule.tls && rule.host === servername;
            }).shift();

        return rule ? rule.tls : undefined;
    };
}

/** export the sni function */
module.exports = sni;

