const { getTenantConnection } = require('../utils/tenantDbManager');
const { getReminderModel } = require('../model/Reminder');
const { getClientModel } = require('../model/Client');

exports.getAllReminders = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const conn = await getTenantConnection(slug);
        const Reminder = getReminderModel(conn);
        const Client = getClientModel(conn); // required to register schema for populate

        const reminders = await Reminder.find()
            .populate('customer', 'fullName phone')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, data: reminders });
    } catch (error) {
        next(error);
    }
};

exports.createReminder = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const conn = await getTenantConnection(slug);
        const Reminder = getReminderModel(conn);

        const reminder = await Reminder.create(req.body);
        res.status(201).json({ success: true, data: reminder });
    } catch (error) {
        next(error);
    }
};

exports.updateReminder = async (req, res, next) => {
    try {
        const { slug, id } = req.params;
        const conn = await getTenantConnection(slug);
        const Reminder = getReminderModel(conn);

        const updated = await Reminder.findByIdAndUpdate(id, req.body, { new: true });
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Reminder not found' });
        }

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
};

exports.deleteReminder = async (req, res, next) => {
    try {
        const { slug, id } = req.params;
        const conn = await getTenantConnection(slug);
        const Reminder = getReminderModel(conn);

        const deleted = await Reminder.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Reminder not found' });
        }

        res.status(200).json({ success: true, message: 'Reminder deleted' });
    } catch (error) {
        next(error);
    }
};

exports.retryReminder = async (req, res, next) => {
    try {
        const { slug, id } = req.params;
        const conn = await getTenantConnection(slug);
        const Reminder = getReminderModel(conn);

        const reminder = await Reminder.findById(id);
        if (!reminder) {
            return res.status(404).json({ success: false, message: 'Reminder not found' });
        }

        const Tenant = require('../model/Tenant');
        const tenant = await Tenant.findOne({ slug });
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        const { sendSingleReminderImmediately } = require('../utils/scheduler');
        const sendRes = await sendSingleReminderImmediately(tenant, reminder);

        if (sendRes.success) {
            reminder.status = 'Sent';
            await reminder.save();
            res.status(200).json({ success: true, message: 'Reminder sent successfully' });
        } else {
            reminder.status = 'Failed';
            await reminder.save();
            res.status(500).json({ success: false, message: sendRes.error || 'Failed to send reminder' });
        }
    } catch (error) {
        next(error);
    }
};
