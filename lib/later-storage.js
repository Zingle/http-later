var EventEmitter = require("events").EventEmitter,
    prop = require("propertize");

/**
 * Create an abstract function.  Essentially, this just creates a function
 * which throws an error.
 * @returns {function}
 */
function abstract() {
    return function() {
        throw new Error("abstract method missing implementation");
    }
}

/**
 * Base interface for storage.
 * @augments {EventEmitter}
 */
function LaterStorage() {
    EventEmitter.call(this);
}

LaterStorage.prototype = Object.create(EventEmitter.prototype);
LaterStorage.prototype.constructor = LaterStorage;

/**
 * Remove a request from the queue and return it.
 * @param {function} done
 */
LaterStorage.prototype.unqueue = abstract();

/**
 * Queue a request and pass its key to the callback
 * @param {object} req
 * @param {function} done
 */
LaterStorage.prototype.queue = abstract();

/** export LaterStorage class */
module.exports = LaterStorage;