var receive = require("./serialize-incoming"),
    concussion = require("concussion");

/**
 * Create connect middleware using the Later configuration.
 * @param {Later} later
 * @returns {function}
 */
function later(later) {
    var Later = require("./later");

    if (!(later instanceof Later)) later = new Later(later);

    return function(req, res) {
        var headers = concussion(req.headers),
            methods = {},
            allRules = later.rules,
            hostedRules, foundRules, acceptableRules,
            rule;

        function checkHost(rule)    {return rule.checkHost(req);}
        function checkPath(rule)    {return rule.checkPath(req);}
        function checkMethod(rule)  {return rule.checkMethod(req);}

        // filter out any rules which don't match the host
        hostedRules = allRules.filter(checkHost);

        // 404 on invalid path
        foundRules = hostedRules.filter(checkPath);
        if (foundRules.length === 0) {
            res.writeHead(404, {"Content-Type": "text/plain"});
            res.end("Not Found");
            later.emit("request", req, res);
            return;
        }

        // 405 on invalid method
        acceptableRules = foundRules.filter(checkMethod);
        if (acceptableRules.length === 0) {
            rules.filter(checkPath).forEach(function(rule) {
                methods[rule.method] = true;
            });

            res.writeHead(405, {
                "Content-Type": "text/plain",
                "Accept": Object.keys(methods).join(",")
            });
            res.end("Method Not Allowed");
            later.emit("request", req, res);
            return;
        }

        // use first acceptable rule
        rule = acceptableRules.shift();

        // add forwarding rule request headers
        if (rule.forward && !headers.read("X-Later-Host")) {
            headers.write("X-Later-Host", rule.forward);
        }

        // accept the rest
        receive(req, function(err, req) {
            if (err) {
                res.writeHead(500, {"Content-Type": "text/plain"});
                res.end(err.message);
            } else later.storage.queue(req, function(err, key) {
                if (err) {
                    res.writeHead(500, {"Content-Type": "text/plain"});
                    res.end(err.message);
                } else {
                    res.writeHead(202, {"X-Later-Key": key,"X-Later-Scheme": rule.tls || rule.httpsonly ? "https" : "http"});
                    res.end();

                    concussion.write(req.headers, "X-Later-Key", key);
                    later.emit("request", req, res);
                }
            });
        });
    }
}

/** export the middleware function */
module.exports = later;
