#!/usr/bin/env node
var squabble = require("squabble").createParser(),
    noop = require("noopable"),
    copy = require("objektify").copy,
    tlsfs = require("tlsfs"),
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
storage = copy({driver: "redis"}, readOpts(args.named["--storage"]));
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
server.on("listening", function(host) {
    var scheme = host.opts.tls ? "https" : "http",
        hostname = host.opts.host || "*",
        path = host.opts.path || "/",
        port = parseInt(host.opts.port),
        url;

    if (port === 443 && scheme === "https") port = "";
    else if (port === 80 && scheme === "http") port = "";
    else if (port) port = ":" + port;
    else port = "";

    url = scheme + "://" + hostname + port + path;
    console.log(("listening on " + url).green);
});

// log some other server events
server.on("replay", function() {console.log("replaying".gray);});
server.on("drain", function() {console.log("drained".gray);});
server.on("refill", function() {console.log("refilling from queue".gray);});
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

// log retries
server.on("retry", function(req) {
    console.log("err".red + " " + req.method + " " + req.url);
});

// log responses to replayed requests
server.on("response", function(res, req) {
    var status;

    if (res instanceof Error) {
        console.log("err".magenta + " " + res.message);
    } else {
        status = String(res.statusCode).magenta;
        console.log(status + " " + req.method + " " + req.url);
    }
});

// begin replay of queued requests
if (args.named["--replay"]) server.replay();

// begin accepting and queueing requests
args.named["--accept"].forEach(function(accept) {
    var opts = readOpts(accept);

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

    (opts ? String(opts) : "").split(",")
        .filter(function(val) {return val;})
        .forEach(function(opt) {
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

