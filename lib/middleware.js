var receive = require("./serialize-incoming"),
    headers = require("./headers"),
    readHeader = headers.read,
    writeHeader = headers.write;

/**
 * Create connect middleware using the Later configuration.
 * @param {Later} later
 * @returns {function}
 */
function later(later) {
    var Later = require("./later");

    if (!(later instanceof Later)) later = new Later(later);

    return function(req, res) {
        var headers = {"Content-Type": "text/plain"},
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
            res.writeHead(404, headers);
            res.end("Not Found");
            later.emit("request", res, req);
            return;
        }

        // 405 on invalid method
        acceptableRules = foundRules.filter(checkMethod);
        if (acceptableRules.length === 0) {
            rules.filter(checkPath).forEach(function(rule) {
                methods[rule.method] = true;
            });

            headers.Accept = Object.keys(methods).join(",");
            res.writeHead(405, headers);
            res.end("Method Not Allowed");
            later.emit("request", res, req);
            return;
        }

        // use first acceptable rule
        rule = acceptableRules.shift();

        // add forwarding rule request headers
        if (rule.forward && !readHeader(req.headers, "X-Later-Host")) {
            writeHeader(req.headers, "X-Later-Host", rule.forward);
        }

        // accept the rest
        receive(req, function(err, req) {
            if (err) res.writeHead(500, headers).end(err.message);
            else later.storage.queue(req, function(key) {
                res.writeHead(202, {"X-Later-Key": key});
                res.end();
                later.emit("request", res, req);
            });
        });
    }
}

/** export the middleware function */
module.exports = later;
