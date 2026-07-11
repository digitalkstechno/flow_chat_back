const tenantService = require('../service/tenantService');

const createTenant = async (req, res, next) => {
    try {
        const { clientName, email } = req.body;
        if (!clientName || !email) {
            return res.status(400).json({ success: false, message: 'clientName and email are required' });
        }
        const tenantData = {
            ...req.body,
            createdBy: req.user?._id
        };
        const tenant = await tenantService.createTenant(tenantData);
        // Exclude dbPassword before sending response
        const tenantResponse = tenant.toObject();
        delete tenantResponse.dbPassword;

        res.status(201).json({ success: true, message: 'Tenant provisioning started successfully', data: tenantResponse });
    } catch (error) {
        next(error);
    }
};

const getTenantDetails = async (req, res, next) => {
    try {
        const tenant = await tenantService.getTenantDetails(req.params.id);
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
        res.status(200).json({ success: true, data: tenant });
    } catch (error) {
        next(error);
    }
};

const getAllTenants = async (req, res, next) => {
    try {
        const tenants = await tenantService.getAllTenants(req.user);
        res.status(200).json({ success: true, data: tenants });
    } catch (error) {
        next(error);
    }
};

const disableTenant = async (req, res, next) => {
    try {
        const tenant = await tenantService.disableTenant(req.params.id);
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
        res.status(200).json({ success: true, message: 'Tenant disabled successfully', data: tenant });
    } catch (error) {
        next(error);
    }
};

const deleteTenant = async (req, res, next) => {
    try {
        const tenant = await tenantService.deleteTenant(req.params.id);
        res.status(200).json({ success: true, message: 'Tenant deleted/archived successfully', data: tenant });
    } catch (error) {
        if (error.message === 'Tenant not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message.includes('Clusters are being terminated')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const updateTenant = async (req, res, next) => {
    try {
        const tenant = await tenantService.updateTenant(req.params.id, req.body);
        res.status(200).json({ success: true, message: 'Tenant updated successfully', data: tenant });
    } catch (error) {
        if (error.message === 'Tenant not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

const getTenantLogs = async (req, res, next) => {
    try {
        const logs = await tenantService.getTenantLogs(req.params.id);
        res.status(200).json({ success: true, data: logs });
    } catch (error) {
        next(error);
    }
};

const updateTenantLog = async (req, res, next) => {
    try {
        const log = await tenantService.updateTenantLog(req.params.logId, req.body);
        if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
        res.status(200).json({ success: true, message: 'Log updated successfully', data: log });
    } catch (error) {
        next(error);
    }
};

const deleteTenantLog = async (req, res, next) => {
    try {
        const log = await tenantService.deleteTenantLog(req.params.logId);
        if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
        res.status(200).json({ success: true, message: 'Log deleted successfully' });
    } catch (error) {
        next(error);
    }
};

// Public endpoint: verify slug exists and get safe tenant info for login page
const getTenantBySlug = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const tenant = await Tenant.findOne({ slug: req.params.slug }).lean();
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        // Return only safe, public-facing fields
        res.status(200).json({
            success: true,
            data: {
                _id: tenant._id,
                clientName: tenant.clientName,
                slug: tenant.slug,
                status: tenant.status,
                planStartDate: tenant.planStartDate,
                planEndDate: tenant.planEndDate
            }
        });
    } catch (error) {
        next(error);
    }
};

const getWhatsappSettings = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { decrypt } = require('../utils/encryption');
        const { slug } = req.params;
        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        
        let decryptedToken = '';
        if (tenant.whatsappAccessToken) {
            try {
                decryptedToken = decrypt(tenant.whatsappAccessToken);
            } catch (err) {
                console.error("Token decryption failed", err);
            }
        }

        let decryptedCrmToken = '';
        if (tenant.crmApiAccessToken) {
            try {
                decryptedCrmToken = decrypt(tenant.crmApiAccessToken);
            } catch (err) {
                console.error("CRM token decryption failed", err);
            }
        }

        res.status(200).json({
            success: true,
            data: {
                whatsappApiBaseUrl: tenant.whatsappApiBaseUrl || '',
                whatsappPhoneNumberId: tenant.whatsappPhoneNumberId || '',
                whatsappWabaId: tenant.whatsappWabaId || '',
                whatsappAccessToken: decryptedToken,
                whatsappKeywordRules: tenant.whatsappKeywordRules || {},
                crmApiDomain: tenant.crmApiDomain || '',
                crmApiAccessToken: decryptedCrmToken
            }
        });
    } catch (error) {
        next(error);
    }
};

const updateWhatsappSettings = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { encrypt } = require('../utils/encryption');
        const { slug } = req.params;
        const tenant = await Tenant.findOne({ slug });
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        
        const {
            whatsappApiBaseUrl, whatsappPhoneNumberId,
            whatsappAccessToken, whatsappWabaId, whatsappBalance,
            whatsappKeywordRules, crmApiDomain, crmApiAccessToken
        } = req.body;
        
        const updateData = {};
        if (whatsappApiBaseUrl !== undefined) updateData.whatsappApiBaseUrl = whatsappApiBaseUrl;
        if (whatsappPhoneNumberId !== undefined) updateData.whatsappPhoneNumberId = whatsappPhoneNumberId;
        if (whatsappWabaId !== undefined) updateData.whatsappWabaId = whatsappWabaId;
        if (whatsappBalance !== undefined) updateData.whatsappBalance = whatsappBalance;
        if (whatsappKeywordRules !== undefined) {
            updateData.whatsappKeywordRules = whatsappKeywordRules;
        }
        if (crmApiDomain !== undefined) updateData.crmApiDomain = crmApiDomain;
        // Only re-encrypt WhatsApp token if a new value is provided and it's non-empty
        if (whatsappAccessToken && whatsappAccessToken.trim()) {
            try {
                updateData.whatsappAccessToken = encrypt(whatsappAccessToken.trim());
            } catch (encErr) {
                return res.status(400).json({ success: false, message: 'Token encryption failed.' });
            }
        }
        // Only re-encrypt CRM token if a new value is provided and it's non-empty
        if (crmApiAccessToken && crmApiAccessToken.trim()) {
            try {
                updateData.crmApiAccessToken = encrypt(crmApiAccessToken.trim());
            } catch (encErr) {
                return res.status(400).json({ success: false, message: 'CRM token encryption failed.' });
            }
        }
        
        // Use findOneAndUpdate with markModified for Mixed field
        const updated = await Tenant.findOneAndUpdate(
            { slug },
            { $set: updateData },
            { new: true, runValidators: false }
        );

        res.status(200).json({ 
            success: true, 
            message: 'WhatsApp settings updated successfully',
            data: {
                whatsappApiBaseUrl: updated.whatsappApiBaseUrl,
                whatsappPhoneNumberId: updated.whatsappPhoneNumberId,
                whatsappWabaId: updated.whatsappWabaId,
                whatsappBalance: updated.whatsappBalance,
                whatsappKeywordRules: updated.whatsappKeywordRules
            }
        });
    } catch (error) {
        next(error);
    }
};

const getWhatsappBalance = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { slug } = req.params;
        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        res.status(200).json({
            success: true,
            balance: tenant.whatsappBalance !== undefined ? tenant.whatsappBalance : 5000.00,
            currency: 'INR'
        });
    } catch (error) {
        next(error);
    }
};

const normalizeApiBaseUrl = (urlParam) => {
    let url = urlParam || 'https://crmapi.crmbot.in/api/meta/v19.0';
    url = url.trim();
    url = url.replace(/([^:])\/\/+/g, '$1/');
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    if (!/\/v\d+(\.\d+)?/.test(url)) {
        url = url + '/v19.0';
    }
    return url;
};

const getWhatsappTemplates = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { decrypt } = require('../utils/encryption');
        const axios = require('axios');
        
        const { slug } = req.params;
        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        
        if (!tenant.whatsappAccessToken || !tenant.whatsappWabaId) {
            return res.status(400).json({ success: false, message: 'WhatsApp settings are not fully configured' });
        }
        
        let token;
        try {
            token = decrypt(tenant.whatsappAccessToken);
        } catch (decErr) {
            return res.status(400).json({ success: false, message: 'WhatsApp access token decryption failed. Please re-configure your credentials.' });
        }
        const cleanBaseUrl = normalizeApiBaseUrl(tenant.whatsappApiBaseUrl);
        
        const response = await axios.get(`${cleanBaseUrl}/${tenant.whatsappWabaId}/message_templates`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        
        res.status(200).json({
            success: true,
            data: response.data?.data || []
        });
    } catch (error) {
        console.error("Fetch templates error:", error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch WhatsApp templates', 
            error: error.response?.data || error.message 
        });
    }
};

const createWhatsappTemplate = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { decrypt } = require('../utils/encryption');
        const axios = require('axios');
        
        const { slug } = req.params;
        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        
        if (!tenant.whatsappAccessToken || !tenant.whatsappWabaId) {
            return res.status(400).json({ success: false, message: 'WhatsApp settings are not fully configured. Please set your Access Token and WABA ID in Settings.' });
        }
        
        let token;
        try {
            token = decrypt(tenant.whatsappAccessToken);
        } catch (decErr) {
            return res.status(400).json({ success: false, message: 'WhatsApp access token decryption failed. Please re-save your credentials in Settings.' });
        }
        const cleanBaseUrl = normalizeApiBaseUrl(tenant.whatsappApiBaseUrl);
        
        const { name, category, language, components } = req.body;
        if (!name || !category || !language || !components) {
            return res.status(400).json({ success: false, message: 'name, category, language and components are required.' });
        }
        
        const response = await axios.post(`${cleanBaseUrl}/${tenant.whatsappWabaId}/message_templates`, {
            name,
            category,
            language,
            components
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // Meta can return 200 OK with an error object inside the body. Inspect and handle it.
        if (response.data?.error) {
            const metaError = response.data.error;
            return res.status(400).json({
                success: false,
                message: metaError.error_user_msg || metaError.message || 'Failed to create template on Meta.',
                error: response.data
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'Template submitted to Meta for approval',
            data: response.data
        });
    } catch (error) {
        console.error("Create template error:", error.response?.data || error.message);
        const metaError = error.response?.data?.error;
        res.status(error.response?.status || 500).json({ 
            success: false, 
            message: metaError?.message || metaError?.error_user_msg || 'Failed to create WhatsApp template',
            error: error.response?.data || error.message 
        });
    }
};

const deleteWhatsappTemplate = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { decrypt } = require('../utils/encryption');
        const axios = require('axios');
        
        const { slug } = req.params;
        const { name } = req.query;
        if (!name) {
            return res.status(400).json({ success: false, message: 'Template name is required as query param (?name=...)' });
        }
        
        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        
        if (!tenant.whatsappAccessToken || !tenant.whatsappWabaId) {
            return res.status(400).json({ success: false, message: 'WhatsApp settings are not fully configured.' });
        }
        
        let token;
        try {
            token = decrypt(tenant.whatsappAccessToken);
        } catch (decErr) {
            return res.status(400).json({ success: false, message: 'Token decryption failed.' });
        }
        const cleanBaseUrl = normalizeApiBaseUrl(tenant.whatsappApiBaseUrl);
        
        const response = await axios.delete(`${cleanBaseUrl}/${tenant.whatsappWabaId}/message_templates`, {
            params: { name },
            headers: { Authorization: `Bearer ${token}` }
        });
        
        res.status(200).json({
            success: true,
            message: `Template "${name}" deleted successfully.`,
            data: response.data
        });
    } catch (error) {
        console.error("Delete template error:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({ 
            success: false, 
            message: 'Failed to delete WhatsApp template', 
            error: error.response?.data || error.message 
        });
    }
};

/**
 * Upload media for use as a WhatsApp template header.
 * This is a proxy to the Meta Resumable Upload API:
 *   Step 1: POST /api/meta/:version/uploads?file_length=...&file_type=... -> { id: "upload:..." }
 *   Step 2: POST /api/meta/:version/:uploadId  with binary body -> { h: "<handle>" }
 * Returns { handle } which can be used as header_handle in template components.
 */
const uploadWhatsappMedia = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { decrypt } = require('../utils/encryption');
        const axios = require('axios');
        
        const { slug } = req.params;
        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        if (!tenant.whatsappAccessToken) {
            return res.status(400).json({ success: false, message: 'WhatsApp Access Token not configured.' });
        }
        
        let token;
        try {
            token = decrypt(tenant.whatsappAccessToken);
        } catch (e) {
            return res.status(400).json({ success: false, message: 'Token decryption failed.' });
        }
        
        const cleanBaseUrl = normalizeApiBaseUrl(tenant.whatsappApiBaseUrl);
        const { fileType, fileLength } = req.body;
        const fileBuffer = req.file?.buffer;
        
        if (!fileBuffer || !fileType || !fileLength) {
            return res.status(400).json({ success: false, message: 'file, fileType, and fileLength are required.' });
        }
        
        // Step 1: Create upload session
        const sessionRes = await axios.post(
            `${cleanBaseUrl}/uploads`,
            null,
            {
                params: { file_length: fileLength, file_type: fileType },
                headers: { Authorization: `Bearer ${token}` }
            }
        );
        const uploadId = sessionRes.data?.id;
        if (!uploadId) {
            return res.status(500).json({ success: false, message: 'Failed to create upload session', error: sessionRes.data });
        }
        
        // Step 2: Upload the binary to the proxy's upload session endpoint
        const uploadUrl = `${cleanBaseUrl}/uploads/${uploadId}`;

        const uploadRes = await axios.post(
            uploadUrl,
            fileBuffer,
            {
                headers: {
                    Authorization: `OAuth ${token}`,
                    'Content-Type': fileType,
                    'file-offset': '0'
                }
            }
        );
        const handle = uploadRes.data?.h;
        if (!handle) {
            return res.status(500).json({ success: false, message: 'Upload succeeded but no handle returned', raw: uploadRes.data });
        }
        
        res.status(200).json({ success: true, handle, uploadId });
    } catch (error) {
        console.error('Media upload error:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            success: false,
            message: 'Media upload failed',
            error: error.response?.data || error.message
        });
    }
};

const sendWhatsappReminder = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { decrypt } = require('../utils/encryption');
        const axios = require('axios');
        
        const { slug } = req.params;
        const tenant = await Tenant.findOne({ slug });
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }
        
        if (!tenant.whatsappAccessToken || !tenant.whatsappPhoneNumberId) {
            return res.status(400).json({ success: false, message: 'WhatsApp settings are not fully configured' });
        }
        
        // Check if balance is sufficient
        const costPerMessage = 0.72; // INR
        const currentBalance = tenant.whatsappBalance !== undefined ? tenant.whatsappBalance : 5000.00;
        if (currentBalance < costPerMessage) {
            return res.status(400).json({ success: false, message: 'Insufficient WhatsApp balance. Please top up.' });
        }
        
        let token;
        try {
            token = decrypt(tenant.whatsappAccessToken);
        } catch (decErr) {
            return res.status(400).json({ success: false, message: 'WhatsApp access token decryption failed. Please re-configure your credentials.' });
        }
        const cleanBaseUrl = normalizeApiBaseUrl(tenant.whatsappApiBaseUrl);
        
        const { phone, templateName, languageCode, parameters } = req.body;
        if (!phone || !templateName) {
            return res.status(400).json({ success: false, message: 'Recipient phone and templateName are required' });
        }
        
        // Strip non-digits from target phone
        let targetPhone = phone.replace(/\D/g, '');
        if (!targetPhone.startsWith('91') && targetPhone.length === 10) {
            targetPhone = '91' + targetPhone; // Default to India prefix if 10 digits
        }
        
        // Map parameters to Meta Cloud API components structure
        const bodyParameters = (parameters || []).map(param => ({
            type: 'text',
            text: param
        }));
        
        const payload = {
            messaging_product: 'whatsapp',
            to: targetPhone,
            type: 'template',
            template: {
                name: templateName,
                language: {
                    code: languageCode || 'en_US'
                }
            }
        };
        
        if (bodyParameters.length > 0) {
            payload.template.components = [
                {
                    type: 'body',
                    parameters: bodyParameters
                }
            ];
        }
        
        const response = await axios.post(`${cleanBaseUrl}/${tenant.whatsappPhoneNumberId}/messages`, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Decrement balance
        const newBalance = Math.max(0, currentBalance - costPerMessage);
        tenant.whatsappBalance = Number(newBalance.toFixed(2));
        await tenant.save();
        
        res.status(200).json({
            success: true,
            message: 'Reminder sent successfully via WhatsApp',
            newBalance: tenant.whatsappBalance,
            data: response.data
        });
    } catch (error) {
        console.error("Send reminder error:", error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send WhatsApp reminder', 
            error: error.response?.data || error.message 
        });
    }
};

// ─── com.bot CRM API Proxy Controllers ─────────────────────────────────────

/**
 * GET /:slug/whatsapp-chats
 * Lists contacts from com.bot CRM  (proxied)
 */
const getWhatsappChats = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { decrypt } = require('../utils/encryption');
        const axios = require('axios');

        const { slug } = req.params;
        const { page = 1, limit = 1000, search = '' } = req.query;

        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
        if (!tenant.crmApiDomain || !tenant.crmApiAccessToken) {
            return res.status(400).json({ success: false, message: 'CRM API is not configured. Please add CRM API Domain and Access Token in WhatsApp Settings.' });
        }

        let token;
        try { token = decrypt(tenant.crmApiAccessToken); }
        catch (e) { return res.status(400).json({ success: false, message: 'CRM API token decryption failed.' }); }

        const base = tenant.crmApiDomain.replace(/\/$/, '');
        let url = `${base}/crm/chat?page=${page}&limit=${limit}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const response = await axios.get(url, { headers: { 'API-KEY': token } });
        return res.status(200).json({ success: true, data: response.data });
    } catch (error) {
        console.error('getWhatsappChats error:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({ success: false, message: error.response?.data?.message || 'Failed to fetch chats', error: error.response?.data || error.message });
    }
};

/**
 * GET /:slug/whatsapp-chats/:chatId/messages
 * Fetch message history for a contact from com.bot CRM (proxied)
 */
const getWhatsappChatMessages = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { decrypt } = require('../utils/encryption');
        const axios = require('axios');

        const { slug, chatId } = req.params;
        const { page = 1, limit = 20, sort = 'newest' } = req.query;

        // Force cap limit to maximum 20 to strictly respect com.bot API limits
        const finalLimit = Math.min(Number(limit) || 20, 20);

        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
        if (!tenant.crmApiDomain || !tenant.crmApiAccessToken) {
            return res.status(400).json({ success: false, message: 'CRM API is not configured.' });
        }

        let token;
        try { token = decrypt(tenant.crmApiAccessToken); }
        catch (e) { return res.status(400).json({ success: false, message: 'CRM API token decryption failed.' }); }

        const base = tenant.crmApiDomain.replace(/\/$/, '');
        const url = `${base}/crm/chat/${chatId}/messages?page=${page}&limit=${finalLimit}&sort=${sort}`;

        const response = await axios.get(url, { headers: { 'API-KEY': token } });
        return res.status(200).json({ success: true, data: response.data });
    } catch (error) {
        console.error('getWhatsappChatMessages error:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({ success: false, message: error.response?.data?.message || 'Failed to fetch messages', error: error.response?.data || error.message });
    }
};

/**
 * POST /:slug/whatsapp-chats/:chatId/send
 * Send a text message via WhatsApp Cloud API (existing token + phoneNumberId)
 */
const sendWhatsappChatMessage = async (req, res, next) => {
    try {
        const Tenant = require('../model/Tenant');
        const { decrypt } = require('../utils/encryption');
        const axios = require('axios');

        const { slug } = req.params;
        const { to, message } = req.body;

        if (!to || !message) {
            return res.status(400).json({ success: false, message: 'Recipient phone (to) and message text are required.' });
        }

        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
        if (!tenant.whatsappAccessToken || !tenant.whatsappPhoneNumberId) {
            return res.status(400).json({ success: false, message: 'WhatsApp API is not fully configured. Please configure in API Settings.' });
        }

        let token;
        try { token = decrypt(tenant.whatsappAccessToken); }
        catch (e) { return res.status(400).json({ success: false, message: 'WhatsApp access token decryption failed.' }); }

        const cleanBaseUrl = normalizeApiBaseUrl(tenant.whatsappApiBaseUrl);

        // Normalize phone number
        let phone = String(to).replace(/\D/g, '');
        if (!phone.startsWith('91') && phone.length === 10) phone = '91' + phone;

        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: 'text',
            text: { body: message }
        };

        const response = await axios.post(
            `${cleanBaseUrl}/${tenant.whatsappPhoneNumberId}/messages`,
            payload,
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );

        return res.status(200).json({ success: true, message: 'Message sent successfully', data: response.data });
    } catch (error) {
        console.error('sendWhatsappChatMessage error:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json({ success: false, message: error.response?.data?.message || 'Failed to send message', error: error.response?.data || error.message });
    }
};

const getDashboardSummary = async (req, res, next) => {
    try {
        const summary = await tenantService.getDashboardSummary(req.user);
        res.status(200).json({ success: true, data: summary });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDashboardSummary,
    createTenant,
    getTenantDetails,
    getAllTenants,
    updateTenant,
    disableTenant,
    deleteTenant,
    getTenantLogs,
    updateTenantLog,
    deleteTenantLog,
    getTenantBySlug,
    getWhatsappSettings,
    updateWhatsappSettings,
    getWhatsappBalance,
    getWhatsappTemplates,
    createWhatsappTemplate,
    deleteWhatsappTemplate,
    uploadWhatsappMedia,
    sendWhatsappReminder,
    getWhatsappChats,
    getWhatsappChatMessages,
    sendWhatsappChatMessage
};
