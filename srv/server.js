const cds = require('@sap/cds');

// Bootstrap CAP server
cds.on('bootstrap', (app) => {
    console.log('[CAP] Server bootstrapping...');

    // Register middleware only after CAP provides the express app instance.
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Requested-With');

        if (req.method === 'OPTIONS') {
            res.status(200).end();
            return;
        }
        next();
    });
});

cds.on('served', () => {
    console.log('[CAP] Service served successfully');
    console.log('[CAP] Available endpoints:');
    console.log('  - /odata/v4/procurement');
});

// Export for testing
module.exports = cds.server;
