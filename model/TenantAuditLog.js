const mongoose = require('mongoose');

const tenantAuditLogSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    action: { type: String, required: true },
    status: { type: String, enum: ['success', 'failed', 'pending'], required: true },
    details: { type: Object },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TenantAuditLog', tenantAuditLogSchema);
