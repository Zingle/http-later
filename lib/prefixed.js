/**
 * Return true if string has a prefix or one of several prefixes.
 * @param {string} val
 * @param {string|string[]} prefix
 */
function prefixed(val, prefix) {
    if (!prefix) prefix = [];
    if (!(prefix instanceof Array)) prefix = [String(prefix)];

    return prefix.length === 0 || prefix.some(function(prefix) {
        return val.substr(0, prefix.length) === prefix;
    });
}

/** export prefixed function */
module.exports = prefixed;
