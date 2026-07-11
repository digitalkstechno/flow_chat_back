const Tenant = require('../model/Tenant');
const mongoose = require('mongoose');

module.exports = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ status: "Fail", message: "Unauthorized" });
        }

        const tenantId = req.params.id;
        const oldestUser = await mongoose.model("User").findOne().sort({ createdAt: 1 });
        const isMaster = req.user.isMaster || (oldestUser && String(oldestUser._id) === String(req.user._id));

        // If master superadmin (and not an affiliate), they bypass all checks
        if (isMaster && req.user.role !== 'affiliate') {
            return next();
        }

        // If a specific tenant is being accessed
        if (tenantId) {
            const tenant = await Tenant.findById(tenantId);
            if (!tenant) {
                return res.status(404).json({ success: false, message: 'Tenant not found' });
            }

            // If it's a GET request (read operation)
            if (req.method === 'GET') {
                // Non-master superadmins are allowed to read all tenants
                if (req.user.role !== 'affiliate') {
                    return next();
                }

                // Affiliates can only read their own
                if (tenant.createdBy && String(tenant.createdBy) === String(req.user._id)) {
                    return next();
                }
            } else {
                // For write operations (PUT, PATCH, DELETE):
                // Affiliates are allowed to modify if they created it
                if (req.user.role === 'affiliate') {
                    if (tenant.createdBy && String(tenant.createdBy) === String(req.user._id)) {
                        return next();
                    }
                }
            }

            return res.status(403).json({
                status: "Fail",
                message: "Forbidden: You are not authorized to perform this operation on this tenant."
            });
        }

        // If no tenantId is in params (e.g. creating a tenant POST /api/tenants)
        if (req.method === 'POST') {
            // Master superadmins or affiliates are allowed to create tenants
            if (req.user.role === 'affiliate' || isMaster) {
                return next();
            }
        }

        return res.status(403).json({
            status: "Fail",
            message: "Forbidden: You are not authorized to perform this operation."
        });
    } catch (err) {
        next(err);
    }
};
