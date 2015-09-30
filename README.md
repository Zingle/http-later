HTTP Later
==========
Queue incoming HTTP requests and replay them later.

Usage
-----
```
Usage: http-later [[-v|--verbose], ...] [-q|--quiet|-s|--silent]
    [[-A|--accept=<aspec>]] [-S|--storage=<sspec>] [-r|--replay]

  -A  --accept=<aspec>  accept requests; see Accepting Requests below
  -q  --quiet           do not write any output
  -s  --silent          alias for --quiet
  -S  --storage=<sspec> configure server storage; see Storage below
  -v  --verbose         increase output; use multiple times for more output

Accepting Requests
  The --accept option adds a rule describing requests which should be accepted
  by http-later.  The value is expected to be a comma-delimited list of colon-
  delimited name:value pairs.  The following names are recognized:
  
  host      host name on which to accept requests
  port      port on which server should listen
  method    HTTP method to accept
  methods   colon-delimited list of HTTP methods to accept
  path      URL path prefix to accept; 404 for other paths
  paths     colon-delimited list of URL path prefixes to accept
  tls       paths to TLS certs:  [<pfx>|<cert>:<key>[[:<ca>], ...]]
  
  Example: http-later --accept=host:example.com,methods:GET:POST,port:8080
  
Storage
  By default, http-later will try to use a local redis server for storage and
  prefix all redis keys with "later:".  The --storage option can be used to
  configure other storage options.  The option is expected to be a comma-
  delimited list of colon-delimited name:value pairs.  The following name is
  recognized:
  
  driver    storage driver name, appended to "http-later-" to identify package
  
  The default "redis" driver also recognized the following name:
  
  keyspace  key prefix to use for all redis keys
  
  Example: http-later --storage=keyspace:foo-
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

##### X-Later-Callback
Sent by client to have response posted to a callback URL after replay.

```
X-Later-Callback: https://example.com/receive-queued-response
```

*Example callback request*
```
POST /recieve-queued-response HTTP/1.1
Host: example.com
Content-Type: application/json

{
    "req": {
        "httpVersion": "1.1",
        "method": "GET",
        "url": "/path/to/resource?with=foo",
        "headers": {
            "Host": "service.example.com",
            "X-Later-Server": "queue.example.com"
        }
    },
    "res": {
        "httpVersion": "1.1",
        "status": 200,
        "headers": {
            "Content-Type": "text/plain;charset=ASCII",
            "Content-Length": "3"
        },
        "body": "foo"
    }
}
```

##### X-Later-Host
Sent by client to override the Host header during replay.  The original Host
header will be sent in the X-Later-Server header.

*http-later request to queue.example.com and forwarded to service.example.com*
```
GET /foo HTTP/1.1
Host: queue.example.com
X-Later-Host: service.example.com
```

*Example request passed on to service.example.com*
```
GET /foo HTTP/1.1
Host: service.example.com
X-Later-Server: queue.example.com
```

##### X-Later-Insecure
By default, HTTP Later will replay all requests over TLS.  The client can send
this header (with any value) to force HTTP Later to replay the request without
TLS.

```
X-Later-Host: public.example.com
X-Later-Insecure: any value can go here
```

##### X-Later-Key
Sent to the client when a request is accepted.  It uniquely identifies the
queued request.

```
X-Later-Key: c74c1c6bf9c9fd10247e85252bd6a012
```

##### X-Later-Retry-After
Sent by client to indicate the earliest time a retry should be attempted.
Expects ISO date (YYYY-MM-DDTHH:MM:SS).  Must be used in conjuntion with
`X-Later-Retry-Attempts` (*q.v.*, for example).

##### X-Later-Retry-Attempts
Sent by client to retry the request on failure.  Sets the number of times the
request should be retried.

```
X-Later-Retry-Attempts: 10
X-Later-Retry-After: 2015-04-01T12:34:56
X-Later-Retry-On: 403,503
```

##### X-Later-Retry-On
Sent by client to retry on specified response codes.  Comma (`,`) delimited
lists of HTTP status codes which should be retried.  Must be used in conjuntion
with `X-Later-Retry-Attempts` (*q.v.*, for example).

##### X-Later-Server
Sent during replay when the Host header was overwritten using the X-Later-Host
header.  Contains the original Host header sent by the client.  *q.v.*,
`X-Later-Host` for example.

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
        this.data.push({
            key: key,
            req: req
        });
        done(null, key);
    }, function(done) {
        var req = this.data.unshift();
        done(req);
    });
}

ArrayStorage.prototype = Object.create(LaterStorage.prototype);
ArrayStorage.prototype.constructor = ArrayStorage;
```

###### Installing Storage Driver
The http-later command expects to load drivers using package names beginning
with `http-later-`.  If the driver above is named `http-later-array` and
installed to the `node_modules` folder for http-later, the driver will be
loaded using something like:

```sh
http-later -Sdriver:array
```

