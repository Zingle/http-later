var LaterServer = require("./lib/later-server");

module.exports = {
    LaterServer: LaterServer,
    createServer: LaterServer.create
};
