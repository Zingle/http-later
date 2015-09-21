HTTP Later
==========
Queue incoming HTTP requests and replay them later.

Usage
-----
```
Usage: http-later [[-v|--verbose], ...] [-q|--quiet|-s|--silent]
    [[-A|--accept=<acceptspec>]] [-r|--replay] [-T|--tls-dir=<tls-dir>]
    [-S|--storage=<storespec>]

  -A  --accept=<accepted>   accept requests; see accept options below
  -q  --quiet               only write errors to console
  -s  --silent              do not write to console
  -S  --storage=<storespec> configure server storage
  -T  --tls-dir=<tld-dir>   path prefix for accepted 'tls' option values
  -v  --verbose             increase amount of output; can be used multiple
                            times

acceptspec details
  The --accepted option expects a comma-delimited string of colon-delimited
  name:value pairs.  The following names are recognized:

  host      host name to listen on
  port      listen port; TLS defaults to 443, otherwise defaults to 80
  method    HTTP method to allowed
  methods   colon-delimited HTTP methods allowed
  path      path prefix; 404 for paths which do not begin with prefix
  paths     colon-delimited path prefixes accepted
  tls       paths to TLS certs: [<pfx>|<cert>:<key>[:<ca>]]

storespec details
  The --storage option expects a comma-delimited string of colon-delimited
  name:value pairs.  The following names are recognized:

  driver    storage driver (defaults to "redis")
  <...>     driver specific options
```

Examples
--------
**Example:** accept and queue all incoming HTTP requests to /foo/*
```sh
http-later -Apath:/foo/
```

**Example:** accept and queue all secure requests to example.com
```sh
http-later -Ahost:example.com,tls:/path/to/cert:/path/to/key:/path/to/ca
```

**Example:** accept HTTP requests on port 8000
```sh
http-later -Aport:8000
```

**Example:** replay queued requests
```sh
http-later -r
```

**Example:** configure redis storage
```sh
http-later -Sdriver:redis,keyspace:later:
```

Overview
--------
The HTTP Later module provides a command `http-later` which can be used to
quickly setup an HTTP request queue.  The default storage provider connects to
a local redis database for storing queued requests.  Various options can be
applied to filter requests based on method, path, or protocol.  By default, no
requests will be accepted and nothing will be queued.

When requests arrive, Later will check the request against filters, write
the request to the storage provider, and return a response.

### Reponse Status Codes

##### 202 Accepted
The request was accepted and queued for later.

##### 404 Not Found
The request was rejected because of the URL path.  The `--accept` options can
be used to configure which URL paths are allowed.

##### 405 Method Not Allowed
The request was rejected becasue of the HTTP method.  The `--accept` option can
be used to configure which methods are allowed.

##### 500 Internal Server Error
Something went wrong trying to record the request.

### HTTP Later Headers
The HTTP Later server generates and recognizes a few custom headers which can
be used to control the replay of requests.  It preserves headers except where
noted here.

##### X-Later-Host
Sent by client to override the Host header during replay.  The original Host
header will be sent in the X-Later-Server header.

##### X-Later-Insecure
By default, HTTP Later will replay all requests over TLS.  The client can send
this header (with any value) to force HTTP Later to replay the request without
TLS.

##### X-Later-Key
Sent to the client when a request is accepted.  It uniquely identifies the
queued request.

##### X-Later-Server
Sent during replay when the Host header was overwritten using the X-Later-Host
header.  Contains the original Host header sent by the client.

### Install
```sh
git clone git@github.com:Zingle/http-later.git
cd http-later
npm install -g
```

### Replay
When replay is enabled, the request queue will be continuously scanned for new
requests.  The requests will then passed along to their destination.

### Storage
Storage can be customized by writing new storage drivers.  The default storage
driver is `redis`.  This causes the `http-later` to load the `http-later-redis`
module, which exports a constructor which is used to create a storage instance.
The `http-later` server passes any storage options to the constructor as an
options object.

#### Creating A New Storage Driver
The following steps should be taken to implement a new storage driver.

 * choose a name for the driver
 * create new class extending from LaterStorage
   * call base LaterStorage constructor with `queue` and `unqueue` arguments
   * `queue(object, function)`
     * store request object in queue
     * execute callback with two arguments, `err`, and `key`
       * `key` should uniquely identify the queued request
   * `unqueue(function)`
     * remove a request from the queue
     * execute callback with `req` argument
       * `req` should be the unqueued request
 * install the module in the application `node_modules` directory and name
   the module by taking the driver name and prefixing it with `http-later-`

##### Example Storage Driver
```js
var LaterStorage = require("http-later").LaterStorage,
    randomBytes = require("crypto").randomBytes.bind(null, 16);

/**
 * 'array' storage driver
 * @constructor
 */
function ArrayStorage() {
    this.data = [];

    LaterStorage.call(this, function(req, done) {
        var key = randomBytes().toString("hex");
        
    }, function(done) {
    });
}

ArrayStorage.prototype = Object.create(LaterStorage.prototype);
ArrayStorage.prototype.constructor = ArrayStorage;
