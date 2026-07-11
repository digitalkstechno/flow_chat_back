
const mongoose = require('mongoose');
const Tenant = require('../model/Tenant');
const { decrypt } = require('./encryption');

/**
 * In-memory cache: slug -> mongoose.Connection
 * Each tenant gets its own isolated connection to its Atlas cluster.
 */
const connectionCache = {};

/**
 * Get (or create) a Mongoose connection for a given tenant slug.
 * @param {string} slug - The unique slug of the tenant.
 * @returns {Promise<mongoose.Connection>}
 */
const getTenantConnection = async (slug) => {
    // Return cached connection if it's still open (readyState 1 = connected)
    if (connectionCache[slug] && connectionCache[slug].readyState === 1) {
        return connectionCache[slug];
    }

    // Look up the tenant in the central master DB
    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant) {
        throw new Error(`Tenant with slug '${slug}' not found`);
    }

    if (tenant.status !== 'active') {
        throw new Error(`Tenant '${slug}' is not active (status: ${tenant.status})`);
    }

    if (!tenant.clusterConnectionString) {
        throw new Error(`Tenant '${slug}' has no database connection string configured`);
    }

    // Decrypt the connection string stored by tenantService
    const decryptedConnectionString = decrypt(tenant.clusterConnectionString);

    // Guard: if the cluster is still provisioning
    if (decryptedConnectionString.includes('Provisioning in progress')) {
        throw new Error(`Tenant '${slug}' database is still being provisioned. Please try again in a few minutes.`);
    }

    // Create a new isolated connection (not the default mongoose connection)
    const conn = await mongoose.createConnection(decryptedConnectionString, {
        serverSelectionTimeoutMS: 10000,
    }).asPromise();

    connectionCache[slug] = conn;
    console.log(`✅ Tenant DB connected for: ${slug}`);

    // Remove from cache if connection closes
    conn.on('disconnected', () => {
        delete connectionCache[slug];
        console.log(`⚠️  Tenant DB disconnected for: ${slug}`);
    });

    return conn;
};

module.exports = { getTenantConnection };
