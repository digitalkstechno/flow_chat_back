const { getTenantConnection } = require('../utils/tenantDbManager');
const { getClientModel } = require('../model/Client');
const { getCustomerGroupModel } = require('../model/CustomerGroup');

// ─── GET all clients ──────────────────────────────────────────────────────────
exports.getAllClients = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const conn = await getTenantConnection(slug);
        const Client = getClientModel(conn);

        const clients = await Client.find()
            .populate('group', 'name color')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, data: clients });
    } catch (error) {
        next(error);
    }
};

// ─── CREATE client ────────────────────────────────────────────────────────────
exports.createClient = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { fullName, phone, email, group } = req.body;

        if (!fullName || !phone) {
            return res.status(400).json({ success: false, message: 'fullName and phone are required' });
        }

        const conn = await getTenantConnection(slug);
        const Client = getClientModel(conn);

        // Check for duplicate phone
        const existing = await Client.findOne({ phone });
        if (existing) {
            return res.status(409).json({ success: false, message: `A client with phone ${phone} already exists.` });
        }

        const client = await Client.create({
            fullName: fullName.trim(),
            phone: phone.trim(),
            email: email?.trim() || 'N/A',
            group: group || undefined,
        });

        const populated = await Client.findById(client._id)
            .populate('group', 'name color')
            .lean();

        res.status(201).json({ success: true, data: populated });
    } catch (error) {
        next(error);
    }
};

// ─── UPDATE client ────────────────────────────────────────────────────────────
exports.updateClient = async (req, res, next) => {
    try {
        const { slug, id } = req.params;
        const { fullName, phone, email, group } = req.body;

        const conn = await getTenantConnection(slug);
        const Client = getClientModel(conn);

        // Check phone uniqueness (excluding current client)
        if (phone) {
            const existing = await Client.findOne({ phone, _id: { $ne: id } });
            if (existing) {
                return res.status(409).json({ success: false, message: `Phone ${phone} is already in use by another client.` });
            }
        }

        const updateData = {};
        if (fullName !== undefined) updateData.fullName = fullName.trim();
        if (phone !== undefined) updateData.phone = phone.trim();
        if (email !== undefined) updateData.email = email.trim() || 'N/A';
        if (group !== undefined) updateData.group = group || null;

        const updated = await Client.findByIdAndUpdate(id, updateData, { new: true })
            .populate('group', 'name color')
            .lean();

        if (!updated) {
            return res.status(404).json({ success: false, message: 'Client not found' });
        }

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
};

// ─── DELETE client ────────────────────────────────────────────────────────────
exports.deleteClient = async (req, res, next) => {
    try {
        const { slug, id } = req.params;
        const conn = await getTenantConnection(slug);
        const Client = getClientModel(conn);

        const deleted = await Client.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Client not found' });
        }

        res.status(200).json({ success: true, message: 'Client deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// ─── BULK CREATE clients ──────────────────────────────────────────────────────
exports.bulkCreateClients = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const clients = req.body;

        if (!Array.isArray(clients) || clients.length === 0) {
            return res.status(400).json({ success: false, message: 'Request body must be a non-empty array of clients.' });
        }

        const conn = await getTenantConnection(slug);
        const Client = getClientModel(conn);

        // Fetch existing phones to skip duplicates
        const existingPhones = new Set(
            (await Client.find({}, 'phone').lean()).map(c => c.phone)
        );

        const toInsert = clients.filter(c => c.fullName && c.phone && !existingPhones.has(c.phone)).map(c => ({
            fullName: c.fullName.trim(),
            phone: c.phone.trim(),
            email: c.email?.trim() || 'N/A',
            group: c.group || undefined,
        }));

        if (toInsert.length === 0) {
            return res.status(200).json({ success: true, count: 0, message: 'No new clients to import (all phones already exist).' });
        }

        await Client.insertMany(toInsert, { ordered: false });

        res.status(201).json({
            success: true,
            count: toInsert.length,
            skipped: clients.length - toInsert.length,
            message: `Successfully imported ${toInsert.length} clients.`
        });
    } catch (error) {
        next(error);
    }
};
