#!/usr/bin/env node
var squabble = require("squabble").createParser(),
    noop = require("noopable"),
    later = require("../lib/later-server").create,
    server, hosts,
    args;

// ensure color support enabled
require("colors");

// patch console object
console.error = noop(console.error).enable();
console.log = noop(console.log).enable();
console.info = noop(console.info).disable();
console.dir = noop(console.dir).disable();
console.trace = noop(console.trace).disable();

// set up CLI argument parsing
squabble.shortOpts().longOpts().stopper()
    .list("-A", "--accept")
    .count("-v", "--verbose")
    .flag("-q", "--quiet")
    .flag("-s", "--silent")
    .flag("-r", "--replay")
    .option("-S", "--storage");

// parse global CLI args
args = squabble.parse();

// configure logging
if (args.named["--quiet"] || args.named["--silent"]) {
    console.log.disable();
    if (args.named["--silent"]) console.error.disable();
} else {
    if (args.named["--verbose"] > 0) console.info.enable();
    if (args.named["--verbose"] > 1) console.dir.enable();
    if (args.named["--verbose"] > 2) console.trace.enable();
}

// configure storage
storage = args.named["--storage"]
    ? readOpts(args.named["--storage"])
    : {driver: "redis"};
storage.module = "http-later-" + storage.driver;
storage.ctor = require(storage.module);

// create server
server = later({storage: new storage.ctor(storage)});
console.log("starting server".green);

// on server error, write to console and shutdown
server.on("error", function(err) {
    console.error(String(err).red);
    console.log("shutting down".green);
    server.close(function() {
        process.exit(1);
    });
});

// log info about listeners
server.on("listening", function(httpServer) {
    var scheme = httpServer.laterOpts.tls ? "https" : "http",
        host = httpServer.laterOpts.host || "*",
        path = httpServer.laterOpts.path || "/",
        port = parseInt(httpServer.laterOpts.port),
        url;

    if (port === 443 && scheme === "https") port = "";
    else if (port === 80 && scheme === "http") port = "";
    else if (port) port = ":" + port;
    else port = "";

    url = scheme + "://" + host + port + path;
    console.log(("listening on " + url).green);
});

// log some other server events
server.on("replay", function() {console.log("replaying".gray);});
server.on("drain", function() {console.log("drained".gray);});
server.on("backoff", function() {console.log("backing off".gray);});

// log responses to incoming requests
server.on("request", function(res, req) {
    var status = res.statusCode;

    if (status < 200) status = String(status).yellow;
    else if (status < 300) status = String(status).cyan;
    else if (status < 500) status = String(status).yellow;
    else status = String(status).red;

    console.log(status + " " + req.method + " " + req.url);
});

// log responses to replayed requests
server.on("response", function(res, req) {
    var status = String(res.statusCode).magenta;
    console.log(status + " " + req.method + " " + req.url);

    // print some additional error info for server errors
    if (res.statusCode >= 500) {
        console.info("-- begin error response ----------------------".magenta);
        console.info(String(res.body).magenta);
        console.info("---end error response ------------------------".magenta);
    }
});

// begin replay of queued requests
if (args.named["--replay"]) server.replay();

// begin accepting and queueing requests
args.named["--accept"].forEach(function(accept) {
    var opts = readOpts(accept),
        tls;

    // parse tls option if present
    if (opts.tls) {
        tls = opts.tls.split(":");
        if (tls.length === 1) {
            opts.tls = {pfx: tls.shift()};
        } else if (tls.length === 2) {
            opts.tls = {cert: tls.shift(), key: tls.shift()};
        } else if (tls.length === 3) {
            opts.tls = {cert: tls.shift(), key: tls.shift(), ca: tls.shift()};
        } else {
            console.error(String("unrecognized 'tls' option " + opts.tls).red);
            process.exit(1);
        }
    }

    // start accepting
    server.accept(opts);
});

/**
 * Parse an option string such as the one used with --accept.
 * @param {string} opts
 * @returns {object}
 */
function readOpts(opts) {
    var result = {};

    opts.split(",").forEach(function(opt) {
        var parts = opt.split(":"),
            msg;

        if (parts.length < 2 || !parts[0] || parts[0] in result) {
            msg = String("invalid or unrecognized option '" + opt + "'").red;
            console.log(msg);
        } else {
            result[parts[0]] = parts.slice(1).join(":");
        }
    });
    
    return result;
}

