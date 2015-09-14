/**
 * Forward an event from one EventEmitter to another.
 * @param {string} event
 * @param {EventEmitter} source
 * @param {EventEmitter} target
 */
function forward(event, source, target) {
    source.on(event, target.emit.bind(target, event));
}

/** export forward function */
module.exports = forward;
