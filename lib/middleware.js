var receive = require("./serialize-incoming");

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
            rules = later.rules;
        
        function checkHost(rule)    {return rule.checkHost(req);}
        function checkPath(rule)    {return rule.checkPath(req);}
        function checkMethod(rule)  {return rule.checkMethod(req);}

        // filter out any rules which don't match the host
        rules = rules.filter(checkHost);

        // 404 on invalid path
        if (rules.filter(checkPath).length === 0) {
            res.writeHead(404, headers);
            res.end("Not Found");
            later.emit("request", res, req);
            return;
        }

        // 405 on invalid method
        if (rules.filter(checkPath).filter(checkMethod).length === 0) {
            rules.filter(checkPath).forEach(function(rule) {
                methods[rule.method] = true;
            });

            headers.Accept = Object.keys(methods).join(",");
            res.writeHead(405, headers);
            res.end("Method Not Allowed");
            later.emit("request", res, req);
            return;
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
