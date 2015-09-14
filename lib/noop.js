/**
 * Patch a function to provide config methods to enable and disable the
 * function.
 * @param {function} fn
 * @returns {function}
 */
function noop(fn) {
    var patched,
        disabled = false;

    if (fn.patched) return fn;

    patched = function() {
        if (!disabled) fn.apply(this, arguments);
    }

    patched.patched = true;
    patched.disable = function() {disabled = true; return patched;}
    patched.enable = function() {disabled = false; return patched;}

    return patched;
}

/** export the noop function */
module.exports = noop;
