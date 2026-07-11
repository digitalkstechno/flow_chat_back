const mongoose = require('mongoose');
const Tenant = require('../model/Tenant');
const TenantAuditLog = require('../model/TenantAuditLog');
const atlasApiService = require('./atlasApiService');
const { generateStrongPassword } = require('../utils/passwordGenerator');
const { encrypt, decrypt } = require('../utils/encryption');

class TenantService {
    async createTenant(tenantData) {
        const { 
            clientName, email, mobile, amount, paidAmount, storageLimitGB, 
            paymentStatus, adminPassword, planStartDate, planEndDate, 
            accountType, createdBy, whatsappApiBaseUrl, whatsappPhoneNumberId, 
            whatsappAccessToken, whatsappWabaId 
        } = tenantData;
        let tenantId = null;

        try {
            const projectName = clientName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'tenant';
            const dbUsername = clientName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
            const databaseName = `${dbUsername}_db`;
            const randomPassword = 'prince1353'; // Match with hardcoded encrypt
            const dbPasswordEncrypted = encrypt(randomPassword);

            // Generate a 100% unique slug safely derived from the client's name
            let uniqueSlug = projectName;
            let slugExists = await Tenant.findOne({ slug: uniqueSlug });
            let counter = 1;
            while (slugExists) {
                uniqueSlug = `${projectName}-${counter}`;
                slugExists = await Tenant.findOne({ slug: uniqueSlug });
                counter++;
            }

            let finalPaymentStatus = paymentStatus || 'PENDING';
            let finalPaidAmount = paidAmount !== undefined ? Number(paidAmount) : 0;
            const finalAmount = amount !== undefined ? Number(amount) : 0;

            if (finalPaymentStatus === 'COMPLETED') {
                finalPaidAmount = finalAmount;
            } else if (finalPaymentStatus === 'PENDING') {
                finalPaidAmount = 0;
            } else if (finalPaymentStatus === 'PARTIAL') {
                if (finalPaidAmount <= 0) {
                    throw new Error("Paid amount must be greater than 0 for partial payment.");
                }
                if (finalPaidAmount >= finalAmount) {
                    throw new Error("Paid amount must be less than the total amount for partial payment.");
                }
            }

            let finalPlanStartDate = planStartDate ? new Date(planStartDate) : new Date();
            if (isNaN(finalPlanStartDate.getTime())) finalPlanStartDate = new Date();

            let finalPlanEndDate = planEndDate ? new Date(planEndDate) : new Date(new Date(finalPlanStartDate).getTime() + 365 * 24 * 60 * 60 * 1000);
            if (isNaN(finalPlanEndDate.getTime())) finalPlanEndDate = new Date(finalPlanStartDate.getTime() + 365 * 24 * 60 * 60 * 1000);

            const tenant = new Tenant({
                clientName,
                slug: uniqueSlug, // Ensured unique slug
                email,
                mobile,
                projectName,
                databaseName,
                dbUsername,
                dbPassword: dbPasswordEncrypted,
                adminPassword: adminPassword ? encrypt(adminPassword) : undefined,
                status: 'pending',
                amount: finalAmount,
                paidAmount: finalPaidAmount,
                storageLimitGB: storageLimitGB !== undefined ? Number(storageLimitGB) : 1,
                paymentStatus: finalPaymentStatus,
                planStartDate: finalPlanStartDate,
                planEndDate: finalPlanEndDate,
                accountType: accountType || 'live',
                createdBy: createdBy || undefined,
                whatsappApiBaseUrl: whatsappApiBaseUrl || '',
                whatsappPhoneNumberId: whatsappPhoneNumberId || '',
                whatsappAccessToken: whatsappAccessToken ? encrypt(whatsappAccessToken) : '',
                whatsappWabaId: whatsappWabaId || ''
            });
            await tenant.save();
            tenantId = tenant._id;

            await this.logAudit(tenantId, 'Create Tenant Entry', 'pending');

            const org = await atlasApiService.createOrganization(clientName);
            tenant.organizationId = org.id;
            await this.logAudit(tenantId, 'Create Organization', 'success', { orgId: org.id });

            const project = await atlasApiService.createProject(tenant.organizationId, projectName);
            tenant.projectId = project.id;
            await this.logAudit(tenantId, 'Create Project', 'success', { projectId: project.id });

            await atlasApiService.createNetworkAccess(tenant.projectId);
            await this.logAudit(tenantId, 'Create Network Access', 'success');

            await atlasApiService.createDatabaseUser(tenant.projectId, dbUsername, randomPassword);
            await this.logAudit(tenantId, 'Create Database User', 'success', { dbUsername });

            await atlasApiService.createCluster(tenant.projectId, `${projectName}-cluster`);

            tenant.clusterConnectionString = encrypt("Provisioning in progress (usually 3-5 mins)...");
            tenant.status = 'pending';
            await tenant.save();

            // Background polling to wait for Atlas to provision the cluster and return the true connection string
            this.pollAndSetupCluster(tenantId, tenant.projectId, `${projectName}-cluster`, dbUsername, randomPassword, databaseName);

            return tenant;

        } catch (error) {
            if (tenantId) {
                await Tenant.findByIdAndDelete(tenantId);
                await TenantAuditLog.deleteMany({ tenantId });
            }
            throw error;
        }
    }

    async pollAndSetupCluster(tenantId, projectId, clusterName, dbUsername, dbPassword, databaseName) {
        let attempts = 0;
        const maxAttempts = 30; // Check every 20 seconds for up to 10 minutes
        const interval = setInterval(async () => {
            attempts++;
            try {
                const cluster = await atlasApiService.getCluster(projectId, clusterName);

                // If it's IDLE, it means it's fully provisioned. The srvAddress holds the correct connection string including the hash!
                if (cluster.stateName === 'IDLE' && cluster.connectionStrings && cluster.connectionStrings.standardSrv) {
                    clearInterval(interval);

                    let srvAddress = cluster.connectionStrings.standardSrv;
                    // Inject username and password into the SRV connection string
                    srvAddress = srvAddress.replace('mongodb+srv://', `mongodb+srv://${dbUsername}:${dbPassword}@`);

                    const tenant = await Tenant.findById(tenantId);
                    if (tenant) {
                        tenant.clusterConnectionString = encrypt(`${srvAddress}/${databaseName}?retryWrites=true&w=majority`);
                        tenant.status = 'active';
                        await tenant.save();

                        await this.createDefaultCollections(`${srvAddress}/${databaseName}`, databaseName);
                        await this.logAudit(tenantId, 'Create Default Collections', 'success', { note: 'Completed after cluster provisioning' });

                        // Automatically create default staff
                        await this.createDefaultStaff(tenant);
                    }
                }
            } catch (err) {
                console.error("Polling error for cluster", clusterName, err.message);
            }

            if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.error("Cluster provisioning timed out for", clusterName);
            }
        }, 20000);
    }

    async createDefaultCollections(connectionString, dbName) {
        // Only create the 'staffs' collection on provisioning.
        // All other collections (leads, orders, etc.) are created on-demand
        // by the CRM backend when first written to.
        let connection;
        try {
            connection = await mongoose.createConnection(connectionString).asPromise();
            await connection.createCollection('staffs');
            await connection.close();
            console.log(`✅ 'staffs' collection created for db: ${dbName}`);
        } catch (err) {
            if (connection) await connection.close();
            console.error("Failed to create staffs collection", err);
            // Non-fatal — Mongoose will auto-create staffs on first insert anyway
        }
    }

    async logAudit(tenantId, action, status, details = {}) {
        await TenantAuditLog.create({
            tenantId,
            action,
            status,
            details
        });
    }

    async getAllTenants(user) {
        let filter = {};
        if (user && user.role === 'affiliate') {
            filter = { createdBy: user._id };
        }
        const tenants = await Tenant.find(filter).populate('createdBy', 'fullName email').lean();
        return await Promise.all(tenants.map(async (t) => {
            let storageUsedMB = 0;
            let documentCount = 0;
            return {
                ...t,
                storageUsedMB: parseFloat(storageUsedMB.toFixed(2)),
                documentCount
            };
        }));
    }

    async getTenantDetails(id) {
        return await Tenant.findById(id).lean();
    }

    async updateTenant(id, updateData) {
        const allowedFields = [
            'clientName', 'email', 'mobile', 'status', 'amount', 'paidAmount', 
            'storageLimitGB', 'paymentStatus', 'adminPassword', 'planStartDate', 
            'planEndDate', 'accountType', 'whatsappApiBaseUrl', 
            'whatsappPhoneNumberId', 'whatsappAccessToken', 'whatsappWabaId',
            'whatsappBalance'
        ];
        const filtered = {};
        for (const key of allowedFields) {
            if (updateData[key] !== undefined) {
                let val = updateData[key];
                if (key === 'amount' || key === 'paidAmount' || key === 'storageLimitGB' || key === 'whatsappBalance') {
                    val = Number(val);
                }
                if (key === 'adminPassword' || key === 'whatsappAccessToken') {
                    val = val ? encrypt(val) : '';
                }
                if (key === 'planStartDate' || key === 'planEndDate') {
                    val = val ? new Date(val) : null;
                }
                filtered[key] = val;
            }
        }

        // Enforce logical constraints between paymentStatus and paidAmount
        const existingTenant = await Tenant.findById(id).lean();
        if (!existingTenant) throw new Error('Tenant not found');

        const finalStatus = filtered.paymentStatus !== undefined ? filtered.paymentStatus : existingTenant.paymentStatus;
        const finalAmount = filtered.amount !== undefined ? filtered.amount : existingTenant.amount;
        let finalPaidAmount = filtered.paidAmount !== undefined ? filtered.paidAmount : existingTenant.paidAmount;

        if (finalStatus === 'COMPLETED') {
            filtered.paidAmount = finalAmount;
        } else if (finalStatus === 'PENDING') {
            filtered.paidAmount = 0;
        } else if (finalStatus === 'PARTIAL') {
            if (finalPaidAmount <= 0) {
                throw new Error("Paid amount must be greater than 0 for partial payment.");
            }
            if (finalPaidAmount >= finalAmount) {
                throw new Error("Paid amount must be less than the total amount for partial payment.");
            }
        }

        filtered.updatedAt = new Date();
        const tenant = await Tenant.findByIdAndUpdate(id, filtered, { new: true });
        if (!tenant) throw new Error('Tenant not found');
        await this.logAudit(id, 'Update Tenant', 'success', { updatedFields: Object.keys(filtered) });

        // Sync password to tenant db admin user if updated
        if (updateData.adminPassword !== undefined) {
            try {
                const { getTenantConnection } = require('../utils/tenantDbManager');
                const { getStaffModel } = require('../model/Staff');
                const { encryptData } = require('../utils/crypto');

                const conn = await getTenantConnection(tenant.slug);
                const Staff = getStaffModel(conn);

                const encryptedPassword = encryptData(updateData.adminPassword);
                await Staff.findOneAndUpdate(
                    { email: tenant.email },
                    { password: encryptedPassword }
                );
                console.log(`✅ Admin staff password updated and synced for tenant: ${tenant.slug}`);
            } catch (syncErr) {
                console.error(`❌ Failed to sync updated admin password to tenant staff db:`, syncErr.message);
            }
        }

        // If the status is updated to active, automatically create default staff if not exists
        if (tenant.status === 'active') {
            await this.createDefaultStaff(tenant);
        }

        return tenant;
    }

    async disableTenant(id) {
        const tenant = await Tenant.findByIdAndUpdate(id, { status: 'inactive' }, { new: true });
        await this.logAudit(id, 'Disable Tenant', 'success');
        return tenant;
    }

    async deleteTenant(id) {
        const tenant = await Tenant.findById(id);
        if (!tenant) throw new Error("Tenant not found");

        try {
            if (tenant.projectId) {
                await atlasApiService.deleteProject(tenant.projectId);
            }

            // Hard delete the tenant and its associated audit logs from the database
            await TenantAuditLog.deleteMany({ tenantId: id });
            await Tenant.findByIdAndDelete(id);

            return { deleted: true, _id: id };
        } catch (error) {
            if (error.message.includes('Clusters are being terminated')) {
                tenant.status = 'inactive';
                await tenant.save();
            }
            await this.logAudit(id, 'Delete Tenant', 'failed', { error: error.message });
            throw error;
        }
    }
    async createDefaultStaff(tenant) {
        const { getTenantConnection } = require('../utils/tenantDbManager');
        const { getStaffModel } = require('../model/Staff');
        const { encryptData } = require('../utils/crypto');

        try {
            // Retrieve connection using the slug
            const conn = await getTenantConnection(tenant.slug);
            const Staff = getStaffModel(conn);

            // Check if staff with the tenant's email already exists
            const existing = await Staff.findOne({ email: tenant.email });
            if (!existing) {
                let decryptedPassword = "123456";
                if (tenant.adminPassword) {
                    try {
                        const { decrypt } = require('../utils/encryption');
                        decryptedPassword = decrypt(tenant.adminPassword);
                    } catch (decErr) {
                        console.error("Failed to decrypt tenant adminPassword:", decErr.message);
                    }
                }
                const encryptedPassword = encryptData(decryptedPassword);
                await Staff.create({
                    fullName: tenant.clientName || 'Admin',
                    email: tenant.email,
                    phone: tenant.mobile || '0000000000',
                    password: encryptedPassword,
                    role: 'admin', // The first staff member is the admin
                    status: 'active',
                });
                console.log(`✅ Default admin staff created for tenant: ${tenant.slug}`);
                await this.logAudit(tenant._id, 'Create Default Staff', 'success', { email: tenant.email });

                // Send welcome email with credentials
                try {
                    const sendMailasync = require('../utils/mailing');
                    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                    const portalUrl = `${frontendUrl}/${tenant.slug}/login`;
                    const html = `
                    <div style="font-family: 'Outfit', 'Segoe UI', Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 20px; background-color: #ffffff; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05);">
                        <!-- Banner Image -->
                        <div style="width: 100%; text-align: center; background-color: #f8fafc; border-bottom: 1px solid #f1f5f9;">
                            <img src="${frontendUrl}/CA_Flow_mail.png" alt="CA Flow" style="width: 100%; max-width: 580px; height: auto; display: block;" />
                        </div>
                        
                        <!-- Content Body -->
                        <div style="padding: 32px 24px;">
                            <h2 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0 0 12px 0; letter-spacing: -0.02em;">Welcome to CA Flow!</h2>
                            <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
                                Your dedicated database cluster and isolated tenant portal have been successfully provisioned. You are ready to log in to your dashboard and manage your workflows.
                            </p>
                            
                            <!-- Credentials Card -->
                            <div style="background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
                                <h3 style="margin: 0 0 16px 0; color: #0f172a; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Credentials Overview</h3>
                                
                                <div style="margin-bottom: 12px; font-size: 14px;">
                                    <span style="color: #64748b; display: block; margin-bottom: 4px; font-size: 12px; font-weight: 700; text-transform: uppercase;">Portal URL</span>
                                    <a href="${portalUrl}" style="color: #10b981; font-weight: 700; text-decoration: none; word-break: break-all;">${portalUrl}</a>
                                </div>
                                
                                <div style="margin-bottom: 12px; font-size: 14px;">
                                    <span style="color: #64748b; display: block; margin-bottom: 4px; font-size: 12px; font-weight: 700; text-transform: uppercase;">Admin Email</span>
                                    <strong style="color: #1f2937; font-weight: 700;">${tenant.email}</strong>
                                </div>
                                
                                <div style="font-size: 14px;">
                                    <span style="color: #64748b; display: block; margin-bottom: 4px; font-size: 12px; font-weight: 700; text-transform: uppercase;">Temporary Password</span>
                                    <code style="background-color: #ffffff; border: 1px solid #cbd5e1; color: #0f172a; padding: 4px 8px; border-radius: 6px; font-family: ui-monospace, monospace; font-size: 14px; font-weight: 700; display: inline-block;">${decryptedPassword}</code>
                                </div>
                            </div>
                            
                            <!-- Action CTA -->
                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${portalUrl}" style="background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 15px; font-weight: 700; border-radius: 12px; display: inline-block; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);">
                                    Log In to Dashboard
                                </a>
                            </div>
                            
                            <!-- Security Box -->
                            <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 12px; padding: 16px; margin-bottom: 8px;">
                                <p style="color: #991b1b; font-size: 13px; font-weight: 600; line-height: 1.5; margin: 0;">
                                    ⚠️ Security Reminder: Please update your password immediately after your first login to protect your portal data.
                                </p>
                            </div>
                        </div>
                        
                        <!-- Footer -->
                        <div style="background-color: #f8fafc; border-top: 1px solid #f1f5f9; padding: 20px; text-align: center;">
                            <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
                                This is an automated email from the CA Flow superadmin system.<br />
                                &copy; ${new Date().getFullYear()} CA Flow. All rights reserved.
                            </p>
                        </div>
                    </div>
                    `;

                    await sendMailasync(tenant.email, `Your CA Flow isolated portal is ready!`, html);
                    console.log(`✉️ Default credentials email successfully sent to: ${tenant.email}`);
                } catch (mailErr) {
                    console.error("❌ Failed to send provisioning credentials email:", mailErr.message);
                }
            }
        } catch (error) {
            console.error(`❌ Failed to create default staff for tenant: ${tenant.slug}`, error);
            await this.logAudit(tenant._id, 'Create Default Staff', 'failed', { error: error.message });
        }
    }

    async getDashboardSummary(user) {
        let filter = {};
        if (user && user.role === 'affiliate') {
            filter = { createdBy: user._id };
        }
        const tenants = await Tenant.find(filter).lean();
        
        let totalSubscriptionAmount = 0;
        let totalPaidAmount = 0;
        let totalStorageLimitGB = 0;
        let totalStorageUsedMB = 0;
        let totalDocuments = 0;
        let active = 0;
        let pending = 0;
        let inactive = 0;

        tenants.forEach(t => {
            totalSubscriptionAmount += (t.amount || 0);
            totalPaidAmount += (t.paidAmount || 0);
            totalStorageLimitGB += (t.storageLimitGB || 0);
            totalStorageUsedMB += (t.storageUsedMB || 0);
            totalDocuments += (t.documentCount || 0);

            if (t.status === 'active') active++;
            else if (t.status === 'pending') pending++;
            else inactive++;
        });

        const pendingRevenue = totalSubscriptionAmount - totalPaidAmount;

        const recentTenants = await Tenant.find(filter)
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        let topAffiliates = [];
        if (user && user.role === 'superadmin') {
            const User = mongoose.model('User');
            const affiliates = await User.find({ role: 'affiliate' }).lean();
            
            const affiliatesWithRevenue = await Promise.all(affiliates.map(async (aff) => {
                const affTenants = await Tenant.find({ createdBy: aff._id }).lean();
                let collectedRevenue = 0;
                let totalRevenue = 0;
                affTenants.forEach(t => {
                    collectedRevenue += (t.paidAmount || 0);
                    totalRevenue += (t.amount || 0);
                });
                return {
                    _id: aff._id,
                    fullName: aff.fullName,
                    email: aff.email,
                    clientsCount: affTenants.length,
                    collectedRevenue,
                    totalRevenue
                };
            }));

            topAffiliates = affiliatesWithRevenue
                .sort((a, b) => b.collectedRevenue - a.collectedRevenue)
                .slice(0, 5);
        }

        return {
            totalSubscriptionAmount,
            totalPaidAmount,
            pendingRevenue,
            totalStorageLimitGB,
            totalStorageUsedMB,
            totalDocuments,
            statusStats: { active, pending, inactive },
            recentTenants,
            topAffiliates
        };
    }

    async getTenantLogs(tenantId) {
        return await TenantAuditLog.find({ tenantId }).sort({ createdAt: -1 }).lean();
    }

    async updateTenantLog(logId, updateData) {
        return await TenantAuditLog.findByIdAndUpdate(logId, updateData, { new: true });
    }

    async deleteTenantLog(logId) {
        return await TenantAuditLog.findByIdAndDelete(logId);
    }
}

module.exports = new TenantService();
