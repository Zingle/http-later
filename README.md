HTTP Later
==========
Queue incoming HTTP requests and replay them later.

Usage
-----
```
Usage: http-later [[-v|--verbose], ...] [-q|--quiet|-s|--silent]
    [[-A|--accept=<accepted>]] [-r|--replay] [-T|--tls-dir=<tls-dir>]

  -A  --accept=<accepted>   accept requests; see accept options below
  -q  --quiet               only write errors to console
  -s  --silent              do not write to console
  -T  --tls-dir=<tld-dir>   path prefix for accepted 'tls' option values
  -v  --verbose             increase amount of output; can be used multiple
                            times

accepted options
  The --accepted option expects a comma-delimited string of colon-delimited
  name:value pairs.  The following names are recognized:

  host      host name to listen on
  port      listen port; TLS defaults to 443, otherwise defaults to 80
  method    HTTP method to allowed
  methods   colon-delimited HTTP methods allowed
  path      path prefix; 404 for paths which do not begin with prefix
  paths     colon-delimited path prefixes accepted
  tls       paths to TLS certs: [<pfx>|<cert>:<key>[:<ca>]]
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
