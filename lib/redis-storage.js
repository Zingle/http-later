var LaterStorage = require("./later-storage"),
    sha1 = require("crypto").createHash.bind(null, "sha1"),
    redis = require("redis"),
    prop = require("propertize");

/**
 * Generate a key for the provided request.
 * @param {string} [keybase]
 * @param {object} req
 * @returns {string}
 */
function keygen(keybase, req) {
    if (arguments.length < 2) req = keybase, keybase = "";

    req = JSON.stringify(req);
    hash = sha1();
    hash.update(JSON.stringify(req));
    return keybase + hash.digest("hex");
}

/**
 * Queue a serialized request and pass the storage key to the callback.
 * @param {RedisStorage} storage
 * @param {object} req
 * @param {function} done
 */
function queue(storage, req, done) {
    var key = keygen(req);

    // store req as JSON serialized string
    req = JSON.stringify(req);

    // first add the key to the queue
    storage.cn.rpush(storage.queueKey, key, function(err) {
        if (err) done(err);

        // now store request data
        else storage.cn.set(key, req, function(err) {
            if (err) done(err);
            else done(null, key);
        });
    });
}

/**
 * Remove a request from the queue and pass te serialized request to
 * the callback.
 * @param {RedisStorage} storage
 * @param {function} done
 */
function unqueue(storage, done) {
    storage.cn.lpop(storage.queueKey, function(err, key) {
        if (err) return done(err);

        storage.cn.get(key, function(err, req) {
            if (err) return done(err);
            if (!req) return done();

            storage.cn.del(key);
            done(null, JSON.parse(req));
        });
    });
}

/**
 * LaterStorage Redis implementation.
 * @constructor
 * @augments {LaterStorage}
 * @param {object} [opts]
 * @param {string} [opts.keybase]
 */
function RedisStorage(opts) {
    var queueThis = function(req, done) {queue(this, req, done);},
        unqueueThis = function(done) {unqueue(this, done);};

    LaterStorage.call(this, queueThis, unqueueThis);

    /**
     * @name RedisStorage#cn
     * @type {object}
     * @readonly
     */
    prop.readonly(this, "cn", redis.createClient());

    /**
     * @name RedisStorage#keybase
     * @type {string}
     * @readonly
     */
    prop.readonly(this, "keybase", opts.keybase || "");

    /**
     * @name RedisStorage#queueKey
     * @type {string}
     * @readonly
     */
    prop.derived(this, "queueKey", function() {
        return this.keybase + "queue";
    });

}

RedisStorage.prototype = Object.create(LaterStorage.prototype);
RedisStorage.prototype.constructor = RedisStorage;

/** export RedisStorage class */
module.exports = RedisStorage;