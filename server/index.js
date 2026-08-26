const { server, startServer } = require('../apps/openfy-api/src/legacyEngine.js');
const { handleNodeServerRequest } = require('./expoRequestAdapter');

/** Lets Expo Router development API routes reuse the canonical API engine. */
const handleFetchRequest = (request) => handleNodeServerRequest(server, request);

if (require.main === module) startServer();

module.exports = { handleFetchRequest, server, startServer };
