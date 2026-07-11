
const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        phone: { type: String, required: true },
        password: { type: String, required: true }, // stored encrypted
        role: { type: String, default: 'staff' },    // e.g. staff, manager, admin
        status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    },
    { timestamps: true }
);

/**
 * Returns a Mongoose Model bound to a specific tenant DB connection.
 * We cannot use a static require() here because the model must be
 * registered on the per-tenant connection, not the default connection.
 *
 * @param {mongoose.Connection} conn - Tenant-specific DB connection
 * @returns {mongoose.Model}
 */
const getStaffModel = (conn) => {
    // Re-use the model if already compiled on this connection
    if (conn.models.Staff) return conn.model('Staff');
    return conn.model('Staff', staffSchema);
};

module.exports = { getStaffModel };
