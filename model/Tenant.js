const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
    clientName: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    mobile: { type: String },
    organizationId: { type: String },
    projectId: { type: String },
    projectName: { type: String, required: true },
    databaseName: { type: String, required: true },
    dbUsername: { type: String, required: true },
    dbPassword: { type: String, required: true }, // Will store encrypted password
    adminPassword: { type: String }, // Will store encrypted admin portal password
    clusterConnectionString: { type: String },
    status: { type: String, enum: ['pending', 'active', 'inactive', 'archived', 'failed'], default: 'pending' },
    amount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    storageLimitGB: { type: Number, default: 1 },
    paymentStatus: { type: String, enum: ['PENDING', 'PARTIAL', 'COMPLETED'], default: 'PENDING' },
    planStartDate: { type: Date },
    planEndDate: { type: Date },
    accountType: { type: String, enum: ['live', 'demo'], default: 'live' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    whatsappApiBaseUrl: { type: String, default: '' },
    whatsappPhoneNumberId: { type: String, default: '' },
    whatsappAccessToken: { type: String, default: '' },
    whatsappWabaId: { type: String, default: '' },
    whatsappBalance: { type: Number, default: 5000.00 },
    whatsappKeywordRules: { type: mongoose.Schema.Types.Mixed, default: {} },
    crmApiDomain: { type: String, default: '' },          // com.bot CRM API domain (e.g. https://app.com.bot)
    crmApiAccessToken: { type: String, default: '' },     // com.bot API-KEY (encrypted)
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Tenant', tenantSchema);
