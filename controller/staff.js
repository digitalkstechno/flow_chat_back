const staffService = require('../service/staffService');

exports.createStaff = async (req, res) => {
    try {
        const { slug } = req.params;
        const staffResponse = await staffService.createStaff(slug, req.body);

        return res.status(201).json({
            status: 'Success',
            message: 'Staff member created successfully',
            data: staffResponse,
        });
    } catch (error) {
        let statusCode = 400;
        if (error.message.includes('already exists')) {
            statusCode = 409;
        }
        return res.status(statusCode).json({ status: 'Fail', message: error.message });
    }
};

exports.fetchAllStaff = async (req, res) => {
    try {
        const { slug } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const search = req.query.search || '';

        const result = await staffService.fetchAllStaff(slug, { page, limit, search });

        return res.status(200).json({
            status: 'Success',
            message: 'Staff fetched successfully',
            pagination: { 
                totalRecords: result.total, 
                currentPage: result.page, 
                totalPages: result.totalPages, 
                limit: result.limit 
            },
            data: result.staffList,
        });
    } catch (error) {
        return res.status(500).json({ status: 'Fail', message: error.message });
    }
};

exports.fetchStaffById = async (req, res) => {
    try {
        const { slug, id } = req.params;
        const staff = await staffService.fetchStaffById(slug, id);
        return res.status(200).json({ status: 'Success', data: staff });
    } catch (error) {
        let statusCode = 500;
        if (error.message === 'Staff member not found') {
            statusCode = 404;
        }
        return res.status(statusCode).json({ status: 'Fail', message: error.message });
    }
};

exports.updateStaff = async (req, res) => {
    try {
        const { slug, id } = req.params;
        const updated = await staffService.updateStaff(slug, id, req.body);
        return res.status(200).json({ status: 'Success', message: 'Staff updated successfully', data: updated });
    } catch (error) {
        let statusCode = 400;
        if (error.message === 'Staff member not found') {
            statusCode = 404;
        }
        return res.status(statusCode).json({ status: 'Fail', message: error.message });
    }
};

exports.deleteStaff = async (req, res) => {
    try {
        const { slug, id } = req.params;
        await staffService.deleteStaff(slug, id);
        return res.status(200).json({ status: 'Success', message: 'Staff member deleted successfully' });
    } catch (error) {
        let statusCode = 500;
        if (error.message === 'Staff member not found') {
            statusCode = 404;
        }
        return res.status(statusCode).json({ status: 'Fail', message: error.message });
    }
};

exports.staffLogin = async (req, res) => {
    try {
        const { slug } = req.params;
        const result = await staffService.staffLogin(slug, req.body);

        return res.status(200).json({
            status: 'Success',
            message: 'Logged in successfully',
            token: result.token,
            slug: result.slug,
            data: result.data,
            tenant: result.tenant
        });
    } catch (error) {
        let statusCode = 400;
        if (error.message === 'Tenant not found') {
            statusCode = 404;
        } else if (error.message.includes('Access denied')) {
            statusCode = 403;
        } else if (error.message === 'Invalid email or password') {
            statusCode = 401;
        } else if (error.message === 'Your account has been deactivated') {
            statusCode = 403;
        }
        return res.status(statusCode).json({ status: 'Fail', message: error.message });
    }
};

exports.staffForgotPassword = async (req, res) => {
    try {
        const { slug } = req.params;
        const { email } = req.body;
        const result = await staffService.staffForgotPassword(slug, email);
        return res.status(200).json({ status: 'Success', message: result.message });
    } catch (error) {
        return res.status(400).json({ status: 'Fail', message: error.message });
    }
};

exports.getStaffProfile = async (req, res) => {
    try {
        const { slug } = req.params;
        if (!req.staff) return res.status(401).json({ status: 'Fail', message: 'Unauthorized' });

        if (req.staff.slug !== slug) {
            return res.status(403).json({ status: 'Fail', message: 'Forbidden: slug mismatch' });
        }

        return res.status(200).json({ status: 'Success', data: req.staff });
    } catch (error) {
        return res.status(500).json({ status: 'Fail', message: error.message });
    }
};

exports.staffImpersonate = async (req, res) => {
    try {
        const { slug } = req.params;
        const result = await staffService.staffImpersonate(slug);

        return res.status(200).json({
            status: 'Success',
            message: 'Impersonation successful',
            token: result.token,
            slug: result.slug,
            data: result.data,
            tenant: result.tenant
        });
    } catch (error) {
        let statusCode = 500;
        if (error.message === 'Tenant not found') {
            statusCode = 404;
        } else if (error.message.includes('Access denied')) {
            statusCode = 403;
        } else if (error.message === 'No active staff members found') {
            statusCode = 404;
        }
        return res.status(statusCode).json({ status: 'Fail', message: error.message });
    }
};
