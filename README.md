HTTP Later
==========
Queue incoming HTTP requests and replay them later.

Usage
-----
```
Usage: http-later [[-v|--verbose], ...] [-q|--quiet|-s|--silent]
    [[-A|--accept=<accepted>]] [-r|--replay] [-T|--tls-dir=<tls-dir>]

  -A  --accept=<accepted>   accept requests; see accept options below
  -q  --quiet               disable all output, except errors
  -s  --silent              disable all output, even errors
  -T  --tls-dir=<tld-dir>   path prefix for accepted 'tls' option values
  -v  --verbose             increase amount of output; can be used multiple
                            times

accept options
  host      host name to listen on
  port      listen port; TLS defaults to 443, otherwise defaults to 80
  method    HTTP method to allowed
  methods   colon-delimited HTTP methods allowed
  path      path prefix; 404 for paths which do not begin with prefix
  paths     colon-delimited path prefixes accepted
  tls       paths to TLS certs: [<pfx>|<cert>:<key>[:<ca>]]

  Options are comma-delimited, name and value are colon-delimited.
```

Examples
--------
```sh
CERT_OPTS=tls:zingle.crt:zingle.key:zingle-ca.crt
http-later -vv \
    --tls-dir=/etc/ssl/private \
    --listen=host:dev-admin.zingle.me,path:/res,$CERT_OPTS \
    --listen=host:dev-dashboard.zingle.me:path=/service:$CERT_OPTS \
```

Replay queued requests.
```sh
http-later -vv --replay
```
