var LaterStorage = require("./later-storage"),
    sha1 = require("crypto").createHash.bind(null, "sha1"),
    redis = require("redis"),
    prop = require("propertize");

/**
 * LaterStorage Redis implementation.
 * @constructor
 * @augments {LaterStorage}
 * @param {object} [opts]
 * @param {string} [opts.keybase]
 */
function RedisStorage(opts) {
    LaterStorage.call(this);

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

/**
 * Generate a key for the provided request.
 * @param {object} req
 * @returns {string}
 */
RedisStorage.prototype.keygen = function(req) {
    req = JSON.stringify(req);
    hash = sha1();
    hash.update(JSON.stringify(req));
    return this.keybase + hash.digest("hex");
};

/**
 * Queue a request and pass its key to the callback.
 * @param {object} req
 * @param {function} done
 */
RedisStorage.prototype.queue = function(req, done) {
    var cn = this.cn,
        key = this.keygen(req);

    // store req as JSON serialized string
    req = JSON.stringify(req);

    // first add the key to the queue
    cn.rpush(this.queueKey, key, function(err) {
        if (err) done(err);

        // now store request data
        else cn.set(key, req, function(err) {
            if (err) done(err);
            else done(null, key);
        });
    });
};

/**
 * Remove a request from the queue and pass it to the callback.
 * @param {function} done
 */
RedisStorage.prototype.unqueue = function(done) {
    var redis = this.cn;

    redis.lpop(this.queueKey, function(err, key) {
        if (err) return done(err);

        redis.get(key, function(err, req) {
            if (err) return done(err);
            if (!req) return done();

            redis.del(key);
            done(null, JSON.parse(req));
        });
    });
};

/** export RedisStorage class */
module.exports = RedisStorage;