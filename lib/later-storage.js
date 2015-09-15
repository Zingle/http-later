var EventEmitter = require("events").EventEmitter,
    prop = require("propertize");

/**
 * Create storage.
 * @augments {EventEmitter}
 * @param {function} queue
 * @param {function} unqueue
 */
function LaterStorage(queue, unqueue) {
    EventEmitter.call(this);

    /**
     * @name LaterStorage#queue
     * @type {function}
     * @readonly
     */
    prop.readonly(this, "queue", queue);

    /**
     * @name LaterStorage#unqueue
     * @type {function}
     * @readonly
     */
    prop.readonly(this, "unqueue", unqueue);

}

LaterStorage.prototype = Object.create(EventEmitter.prototype);
LaterStorage.prototype.constructor = LaterStorage;

/** export LaterStorage class */
module.exports = LaterStorage;