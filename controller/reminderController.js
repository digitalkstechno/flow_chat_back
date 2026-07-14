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

        const target = await Reminder.findById(id);
        if (!target) {
            return res.status(404).json({ success: false, message: 'Reminder not found' });
        }

        if (target.campaignId) {
            await Reminder.deleteMany({ campaignId: target.campaignId });
        } else {
            await Reminder.findByIdAndDelete(id);
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

        const target = await Reminder.findById(id);
        if (!target) {
            return res.status(404).json({ success: false, message: 'Reminder not found' });
        }

        const Tenant = require('../model/Tenant');
        const tenant = await Tenant.findOne({ slug });
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        const { sendSingleReminderImmediately } = require('../utils/scheduler');

        if (target.campaignId) {
            const failedReminders = await Reminder.find({ campaignId: target.campaignId, status: 'Failed' });
            if (failedReminders.length === 0) {
                failedReminders.push(target);
            }
            let successCount = 0;
            for (const r of failedReminders) {
                const sendRes = await sendSingleReminderImmediately(tenant, r);
                if (sendRes.success) {
                    r.status = 'Sent';
                    successCount++;
                } else {
                    r.status = 'Failed';
                }
                await r.save();
            }
            return res.status(200).json({ success: true, message: `Retried ${failedReminders.length} messages, ${successCount} sent successfully.` });
        } else {
            const sendRes = await sendSingleReminderImmediately(tenant, target);
            if (sendRes.success) {
                target.status = 'Sent';
                await target.save();
                res.status(200).json({ success: true, message: 'Reminder sent successfully' });
            } else {
                target.status = 'Failed';
                await target.save();
                res.status(500).json({ success: false, message: sendRes.error || 'Failed to send reminder' });
            }
        }
    } catch (error) {
        next(error);
    }
};
