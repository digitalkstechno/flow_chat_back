/**
 * Middleware to restrict staff users to read-only access.
 * If the authenticated user is a staff member with 'staff' role,
 * block all state-changing methods (POST, PUT, DELETE, PATCH).
 */
module.exports = (req, res, next) => {
    if (req.staff && req.staff.role === 'staff' && req.method !== 'GET') {
        return res.status(403).json({
            status: 'Fail',
            message: 'Forbidden: Staff accounts have read-only permissions and are not allowed to add, modify, or delete resources.'
        });
    }
    next();
};
