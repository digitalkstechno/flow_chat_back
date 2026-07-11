
const jwt = require('jsonwebtoken');
const { getTenantConnection } = require('../utils/tenantDbManager');
const { getStaffModel } = require('../model/Staff');

/**
 * Staff authentication middleware.
 * Verifies the JWT, extracts the slug, and attaches the staff document to req.staff.
 * The slug in the token MUST match the slug in the URL param.
 */
const staffAuth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ status: 'Fail', message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

        // Slug from URL must match slug embedded in JWT
        const slugFromUrl = req.params.slug;
        if (slugFromUrl && decoded.slug !== slugFromUrl) {
            return res.status(403).json({ status: 'Fail', message: 'Forbidden: you do not belong to this tenant' });
        }

        // Fetch the staff record from the correct tenant DB
        const conn = await getTenantConnection(decoded.slug);
        const Staff = getStaffModel(conn);
        const staffMember = await Staff.findById(decoded.id).select('-password');

        if (!staffMember) {
            return res.status(401).json({ status: 'Fail', message: 'Invalid token: staff not found' });
        }

        if (staffMember.status === 'inactive') {
            return res.status(403).json({ status: 'Fail', message: 'Account is deactivated' });
        }

        // Attach to request for downstream controllers
        req.staff = { ...staffMember.toObject(), slug: decoded.slug };
        next();
    } catch (err) {
        return res.status(401).json({ status: 'Fail', message: 'Invalid or expired token' });
    }
};

module.exports = staffAuth;
