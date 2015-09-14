var squabble = require("squabble").createParser(),
    later = require(".."),
    noop = require("../lib/noop"),
    server,
    args,
    opts = {};

// ensure color support enabled
require("colors");

// patch console object
console.log = noop(console.log).enable();
console.info = noop(console.info).disable();
console.warn = noop(console.warn).disable();

// set up CLI argument parsing
squabble.shortOpts().longOpts().stopper()
    .list("-m", "--method")
    .list("-h", "--host")
    .list("-P", "--path")
    .count("-v", "--verbose")
    .flag("-q", "--quiet")
    .flag("-s", "--silent")
    .flag("-r", "--replay")
    .option("-p", "--port");

// parse global CLI args
args = squabble.parse();

// configure logging
if (args.named["--quiet"] || args.named["--silent"]) {
    console.log.disable();
} else {
    if (args.named["--verbose"] > 0) console.warn.enable();
    if (args.named["--verbose"] > 1) console.info.enable();
}

// read CLI args and build server options object
args = squabble.parse();
if (args.named["--method"].length > 0) opts.methods = args.named["--method"];
if (args.named["--host"].length > 0) opts.hosts = args.named["--host"];
if (args.named["--path"].length > 0) opts.paths = args.named["--path"];
if (args.named["--port"]) opts.port = args.named["--port"];

// create server and log start message
server = later.createServer(opts);
console.log("starting server".green);

// shutdown on server error after logging
server.on("error", function(err) {
    console.error(String(err).red);
    console.info("shutting down".green);
    server.close(function() {
        process.exit(1);
    });
});

// begin replay of queued requests
if (args.named["--replay"]) server.replay();

// begin listening on server
server.listen(opts.port || process.env.LATER_PORT || 2112, function(address) {
    console.log(("listening on " + address.address + ":" + address.port).cyan);
});

