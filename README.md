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

