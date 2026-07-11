const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true },
        email: { type: String, default: 'N/A' },
        phone: { type: String, required: true },
        paymentStatus: { type: String, enum: ['CLEAR', 'PENDING'], default: 'CLEAR' },
        serviceStatus: { type: String, enum: ['ON', 'OFF'], default: 'ON' },
        accountType: { type: String, enum: ['LIVE', 'DEMO'], default: 'LIVE' },
        group: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerGroup' },
        addedOn: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

/**
 * Returns a Mongoose Model bound to a specific tenant DB connection.
 */
const getClientModel = (conn) => {
    if (conn.models.Client) return conn.model('Client');
    return conn.model('Client', clientSchema);
};

module.exports = { getClientModel };
