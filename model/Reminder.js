const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema(
    {
        title: { type: String, required: true },
        recipientType: { type: String, enum: ['new', 'customers', 'groups'], default: 'customers' },
        customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
        newName: { type: String },
        newPhone: { type: String },
        groupName: { type: String },
        templateName: { type: String, required: true },
        languageCode: { type: String, default: 'en_US' },
        parameters: [{ type: String }],
        headerLink: { type: String },
        headerFormat: { type: String, enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'NONE'], default: 'NONE' },
        scheduledAt: { type: Date, required: true },
        status: { type: String, enum: ['Scheduled', 'Pending', 'Sent', 'Failed'], default: 'Scheduled' },
        repeat: {
            enabled: { type: Boolean, default: false },
            frequency: { type: String, enum: ['day', 'week', 'month', 'year'] },
            interval: { type: Number, default: 1 },
            days: [{ type: Number }], // 0-6 Sunday-Saturday
            endDate: { type: Date }
        }
    },
    { timestamps: true }
);

const getReminderModel = (conn) => {
    if (conn.models.Reminder) return conn.model('Reminder');
    return conn.model('Reminder', reminderSchema);
};

module.exports = { getReminderModel };
