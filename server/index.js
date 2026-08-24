const { server, startServer } = require('../apps/openfy-api/src/legacyEngine.js');

if (require.main === module) startServer();

module.exports = { server, startServer };
