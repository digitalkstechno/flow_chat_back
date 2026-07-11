const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    tenantSlug: { type: String, required: true },
    tenantName: { type: String, required: true },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    raisedBy: { type: String, required: true } // Email of the staff member
}, { timestamps: true });

module.exports = mongoose.model('Ticket', ticketSchema);
