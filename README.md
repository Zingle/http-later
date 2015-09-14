HTTP Later
==========
Queue incoming HTTP requests and replay them later.

Usage
-----
```sh
Usage: http-later [[-m|--method=<method>], ...] [[-h||--host=<host>], ...]
    [-p|--port=<port>] [[-P|--path=<path>], ...] [-r|--replay]
    [[-v|--verbose], ...] [-q|--quiet|-s|--silent]
```

Examples
--------
Accept incoming requests on port 80, queue the request, and return 202 Accepted.
```sh
http-later -p80 -vv
```

Replay queued requests.
```sh
http-later --replay
```
