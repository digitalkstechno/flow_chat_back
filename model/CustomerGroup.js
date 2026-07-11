const mongoose = require('mongoose');

const customerGroupSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        color: { type: String, default: '#3b82f6' }
    },
    { timestamps: true }
);

const getCustomerGroupModel = (conn) => {
    if (conn.models.CustomerGroup) return conn.model('CustomerGroup');
    return conn.model('CustomerGroup', customerGroupSchema);
};

module.exports = { getCustomerGroupModel };
