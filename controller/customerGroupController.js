const { getTenantConnection } = require('../utils/tenantDbManager');
const { getCustomerGroupModel } = require('../model/CustomerGroup');
const { getClientModel } = require('../model/Client');

exports.getAllGroups = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const conn = await getTenantConnection(slug);
        const CustomerGroup = getCustomerGroupModel(conn);
        const Client = getClientModel(conn);

        const groups = await CustomerGroup.find().sort({ createdAt: -1 }).lean();

        // Calculate member count for each group
        const groupsWithCount = await Promise.all(
            groups.map(async (g) => {
                const membersCount = await Client.countDocuments({ group: g._id });
                return {
                    ...g,
                    id: g._id,
                    membersCount
                };
            })
        );

        res.status(200).json({ success: true, data: groupsWithCount });
    } catch (error) {
        next(error);
    }
};

exports.createGroup = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { name, color } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Group name is required' });
        }

        const conn = await getTenantConnection(slug);
        const CustomerGroup = getCustomerGroupModel(conn);

        const group = await CustomerGroup.create({ name, color });
        res.status(201).json({ success: true, data: { ...group.toObject(), id: group._id } });
    } catch (error) {
        next(error);
    }
};

exports.updateGroup = async (req, res, next) => {
    try {
        const { slug, id } = req.params;
        const conn = await getTenantConnection(slug);
        const CustomerGroup = getCustomerGroupModel(conn);

        const updated = await CustomerGroup.findByIdAndUpdate(id, req.body, { new: true }).lean();
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }

        res.status(200).json({ success: true, data: { ...updated, id: updated._id } });
    } catch (error) {
        next(error);
    }
};

exports.deleteGroup = async (req, res, next) => {
    try {
        const { slug, id } = req.params;
        const conn = await getTenantConnection(slug);
        const CustomerGroup = getCustomerGroupModel(conn);
        const Client = getClientModel(conn);

        const deleted = await CustomerGroup.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Group not found' });
        }

        // Unset group for any clients assigned to this group
        await Client.updateMany({ group: id }, { $unset: { group: '' } });

        res.status(200).json({ success: true, message: 'Group deleted successfully' });
    } catch (error) {
        next(error);
    }
};
