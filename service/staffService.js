const jwt = require('jsonwebtoken');
const { getTenantConnection } = require('../utils/tenantDbManager');
const { getStaffModel } = require('../model/Staff');
const { encryptData, decryptData } = require('../utils/crypto');
const Tenant = require('../model/Tenant');

class StaffService {
    async getModelForSlug(slug) {
        const conn = await getTenantConnection(slug);
        return getStaffModel(conn);
    }

    async createStaff(slug, { fullName, email, phone, password, role }) {
        if (!fullName || !email || !phone || !password) {
            throw new Error('fullName, email, phone and password are required');
        }

        const Staff = await this.getModelForSlug(slug);

        const existing = await Staff.findOne({ email });
        if (existing) {
            throw new Error('A staff member with this email already exists');
        }

        const encryptedPassword = encryptData(password);
        const staff = await Staff.create({
            fullName,
            email,
            phone,
            password: encryptedPassword,
            role: role || 'staff',
            status: 'active',
        });

        const staffResponse = staff.toObject();
        delete staffResponse.password;
        return staffResponse;
    }

    async fetchAllStaff(slug, { page = 1, limit = 50, search = '' }) {
        const Staff = await this.getModelForSlug(slug);
        const skip = (page - 1) * limit;

        const query = search
            ? {
                $or: [
                    { fullName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { role: { $regex: search, $options: 'i' } },
                ],
            }
            : {};

        const total = await Staff.countDocuments(query);
        const staffList = await Staff.find(query)
            .select('-password')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        return {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            limit,
            staffList
        };
    }

    async fetchStaffById(slug, id) {
        const Staff = await this.getModelForSlug(slug);
        const staff = await Staff.findById(id).select('-password');
        if (!staff) {
            throw new Error('Staff member not found');
        }
        return staff;
    }

    async updateStaff(slug, id, body) {
        const Staff = await this.getModelForSlug(slug);

        const allowedFields = ['fullName', 'email', 'phone', 'role', 'status', 'password'];
        const update = {};
        for (const key of allowedFields) {
            if (body[key] !== undefined) update[key] = body[key];
        }
        if (update.password) update.password = encryptData(update.password);

        const updated = await Staff.findByIdAndUpdate(id, update, { new: true }).select('-password');
        if (!updated) {
            throw new Error('Staff member not found');
        }
        return updated;
    }

    async deleteStaff(slug, id) {
        const Staff = await this.getModelForSlug(slug);
        const deleted = await Staff.findByIdAndDelete(id);
        if (!deleted) {
            throw new Error('Staff member not found');
        }
        return { deleted: true };
    }

    async staffLogin(slug, { email, password }) {
        if (!email || !password) {
            throw new Error('Email and password are required');
        }

        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) throw new Error('Tenant not found');
        if (tenant.status !== 'active') {
            throw new Error(`Tenant is ${tenant.status}`);
        }

        const Staff = await this.getModelForSlug(slug);
        const staffMember = await Staff.findOne({ email });
        if (!staffMember) throw new Error('Invalid email or password');

        if (staffMember.status === 'inactive') {
            throw new Error('Your account has been deactivated');
        }

        const decryptedPassword = decryptData(staffMember.password);
        if (String(decryptedPassword) !== String(password)) {
            throw new Error('Invalid email or password');
        }

        const token = jwt.sign(
            {
                id: staffMember._id,
                slug,
                role: staffMember.role,
                tenantId: tenant._id,
            },
            process.env.JWT_SECRET_KEY,
            { expiresIn: '7d' }
        );

        const staffResponse = staffMember.toObject();
        delete staffResponse.password;

        return {
            token,
            slug,
            data: staffResponse,
            tenant: {
                _id: tenant._id,
                clientName: tenant.clientName,
                slug: tenant.slug,
            }
        };
    }

    async staffImpersonate(slug) {
        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) throw new Error('Tenant not found');
        if (tenant.status !== 'active') {
            throw new Error(`Tenant is ${tenant.status}`);
        }

        const Staff = await this.getModelForSlug(slug);

        let staffMember = await Staff.findOne({ role: 'admin' });
        if (!staffMember) {
            staffMember = await Staff.findOne({ status: 'active' });
        }

        if (!staffMember) {
            throw new Error('No active staff members found');
        }

        const token = jwt.sign(
            {
                id: staffMember._id,
                slug,
                role: staffMember.role,
                tenantId: tenant._id,
                impersonatedBy: 'superadmin',
            },
            process.env.JWT_SECRET_KEY,
            { expiresIn: '2h' }
        );

        const staffResponse = staffMember.toObject();
        delete staffResponse.password;

        return {
            token,
            slug,
            data: staffResponse,
            tenant: {
                _id: tenant._id,
                clientName: tenant.clientName,
                slug: tenant.slug,
            }
        };
    }

    async staffForgotPassword(slug, email) {
        if (!email) {
            throw new Error('Email is required');
        }

        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) throw new Error('Tenant not found');
        if (tenant.status !== 'active') {
            throw new Error(`Tenant is ${tenant.status}`);
        }

        const Staff = await this.getModelForSlug(slug);
        const staffMember = await Staff.findOne({ email });
        if (!staffMember) {
            throw new Error('No account found with this email');
        }

        if (staffMember.status === 'inactive') {
            throw new Error('Your account is inactive');
        }

        // Generate an 8-character random temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        const encryptedPassword = encryptData(tempPassword);

        staffMember.password = encryptedPassword;
        await staffMember.save();

        // Send reset email via SMTP
        try {
            const sendMailasync = require('../utils/mailing');
            const html = `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <h2 style="color: #4f46e5; margin-bottom: 20px; font-weight: 800; font-size: 22px;">Password Reset Requested</h2>
                <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
                    Hello ${staffMember.fullName || 'User'},<br/>
                    We received a request to reset your password for your CA Flow workspace <strong>${tenant.clientName}</strong>.
                </p>
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #f1f5f9; text-align: center;">
                    <h4 style="margin: 0 0 12px 0; color: #1e293b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Temporary Password</h4>
                    <code style="background-color: #e2e8f0; padding: 6px 12px; border-radius: 6px; font-family: monospace; font-size: 16px; font-weight: bold; color: #4f46e5; letter-spacing: 0.05em;">${tempPassword}</code>
                </div>
                <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                    Please log in using this temporary password and change it immediately from your Profile Settings.
                </p>
                <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 25px 0;" />
                <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">This is an automated system email from your CA Flow workspace.</p>
            </div>
            `;

            await sendMailasync(email, `Temporary Password Reset for ${tenant.clientName}`, html);
            console.log(`✉️ Temporary password email successfully sent to: ${email}`);
        } catch (mailErr) {
            console.error("❌ Failed to send password reset email:", mailErr.message);
            throw new Error('Failed to send email. Please try again later.');
        }

        return { message: 'A temporary password has been sent to your email.' };
    }
}

module.exports = new StaffService();
