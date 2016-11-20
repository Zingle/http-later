#!/usr/bin/env node
var squabble = require("squabble").createParser(),
    noop = require("noopable"),
    copy = require("objektify").copy,
    tlsfs = require("tlsfs"),
    later = require("../lib/later").create,
    requtil = require("../lib/request-util"),
    server, storage,
    args;

// ensure color support enabled
require("colors");

// patch console object
console.error = noop(console.error).enable();
console.log = noop(console.log).disable();
console.info = noop(console.info).disable();
console.dir = noop(console.dir).disable();
console.trace = noop(console.trace).disable();

// set up CLI argument parsing
squabble.shortOpts().longOpts().stopper()
    .list("-A", "--accept")
    .count("-v", "--verbose")
    .flag("-q", "-s", "--quiet", "--silent")
    .flag("-r", "--replay")
    .flag("-F", "--httpsonly")
    .option("-S", "--storage")
    .option("-T", "--tls");

// parse global CLI args
args = squabble.parse();

// configure logging
if (args.named["--quiet"]) {
    console.error.disable();
} else {
    if (args.named["--verbose"] > 0) console.log.enable();
    if (args.named["--verbose"] > 1) console.info.enable();
    if (args.named["--verbose"] > 1) console.dir.enable();
    if (args.named["--verbose"] > 1) console.trace.enable();
}

// configure storage
storage = copy({driver: "redis"}, readOpts(args.named["--storage"]));
storage.module = "http-later-" + storage.driver;
storage.ctor = require(storage.module);

// create server
console.log("starting server".green);
server = later({
    storage: new storage.ctor(storage),
    tls: args.named["--tls"]
        ? tlsfs.readCertsSync(args.named["--tls"].split(":"))
        : null
});

// log info about listeners
server.on("listening", function(address) {
    var msg = "listening on " + address.address + ":" + address.port;
    console.log(msg.green);
});

// log info about accept rules
server.on("accepting", function(rule) {
    var msg = "accepting requests at " + rule;
    if (rule.forward) msg += " for " + rule.forward;
    if (rule.httpsonly) msg += " forcing https scheme.";
    console.log(msg.green);
});

// log some other server events
if (args.named["--verbose"] > 2) {
    server.on("replaying", function() {console.log("replaying".gray);});
    server.on("drain", function()     {console.log("drained".gray);});
    server.on("refill", function()    {console.log("refilling from queue".gray);});
    server.on("backoff", function(ms) {console.log(("backing off "+ms).gray);});
}
server.on("error", function() {console.log("redis gone.".red);});

// log incoming requests and their initial response
server.on("request", function(req, res) {
    var status = res.statusCode;

    if (status < 200) status = String(status).yellow;
    else if (status == 200) status = String(status).green;
    else if (status == 202) status = String(status).green;
    else if (status <  300) status = String(status).cyan;
    else if (status <  500) status = String(status).yellow;
    else status = String(status).red;

    console.log(status + " " + requtil.formatLog(req));
});

// log requests pulled from queue
if (args.named["--verbose"] > 1) {
    server.on("pull", function(req) {
        console.log(("pull " + requtil.formatLog(req)).gray);
    });

    // log delayed requests
    server.on("wait", function(req) {
        console.log(("wait " + requtil.formatLog(req)).gray);
    });

    // log request replays
    server.on("replay", function(req) {
        console.log(("play " + requtil.formatLog(req)).gray);
    });
}

// log responses to replayed requests
server.on("response", function(res, req) {
    var status;
    if (res.statusCode == 200) status = String(res.statusCode).green
    else status = String(res.statusCode).magenta;
    console.log(status + " " + requtil.formatLog(req));
});

// log failure during request replay
server.on("failure", function(err, req) {
    var errmsg = err.message ? (" ! " + err.message).red : "";
    console.log("err".magenta + " " + requtil.formatLog(req) + errmsg);
});

// log retries
server.on("retry", function(req, res) {
    var code = res.statusCode ? String(res.statusCode) : "err",
        err = res.message ? (" ! " + res.message).red : "";
    console.log(code.red + " " + requtil.formatLog(req) + err);
});

// begin replay of queued requests
if (args.named["--replay"]) server.replay();

// begin accepting and queueing requests
args.named["--accept"].forEach(function(accept) {
    var opts = readOpts(accept);

    if (args.named["--httpsonly"]) opts.httpsonly = true;
    // with tls options, load certs, then start accepting
    if (opts.tls) {
        tlsfs.readCerts(opts.tls.split(":"), function(err, tlsopts) {
            opts.tls = tlsopts;
            server.accept(opts);
        });
    }

    // otherwise, can just start accepting
    else server.accept(opts);
});

/**
 * Parse an option string such as the one used with --accept.
 * @param {string} opts
 * @returns {object}
 */
function readOpts(opts) {
    var result = {};
    var flags = { httpsonly: 'true' };

    (opts ? String(opts) : "").split(",")
        .filter(function(val) {return val;})
        .forEach(function(opt) {
            var parts = opt.split(":"),
                msg;

            if (parts.length == 1 && parts[0] in flags) {
                result[parts[0]] = true;
            } else if (parts.length < 2 || !parts[0] || parts[0] in result) {
                msg = String("invalid or unrecognized option '" + opt + "'").red;
                console.error(msg);
            } else {
                result[parts[0]] = parts.slice(1).join(":");
            }
        });

    return result;
}
