const express = require('express');
const router = express.Router();
const tenantController = require('../controller/tenantController');
const staffRouter = require('./staff');
const auth = require('../middleware/auth');
const staffAuth = require('../middleware/staffAuth');
const onlyMasterOrCreatorTenant = require('../middleware/onlyMasterOrCreatorTenant');

/**
 * @swagger
 * tags:
 *   name: Tenants
 *   description: API to manage multi-tenant mongoDB provisioning
 */

router.post('/', auth, onlyMasterOrCreatorTenant, tenantController.createTenant);
router.get('/', auth, tenantController.getAllTenants);

// Public: verify tenant by slug
router.get('/by-slug/:slug', tenantController.getTenantBySlug);

router.get('/dashboard/summary', auth, tenantController.getDashboardSummary);

router.get('/:id', auth, onlyMasterOrCreatorTenant, tenantController.getTenantDetails);
router.patch('/:id/disable', auth, onlyMasterOrCreatorTenant, tenantController.disableTenant);
router.put('/:id', auth, onlyMasterOrCreatorTenant, tenantController.updateTenant);
router.delete('/:id', auth, onlyMasterOrCreatorTenant, tenantController.deleteTenant);

router.get('/:id/logs', auth, onlyMasterOrCreatorTenant, tenantController.getTenantLogs);
router.put('/:id/logs/:logId', auth, onlyMasterOrCreatorTenant, tenantController.updateTenantLog);
router.delete('/:id/logs/:logId', auth, onlyMasterOrCreatorTenant, tenantController.deleteTenantLog);

/**
 * Tenant-scoped Staff routes
 */
router.use('/:slug/staff', staffRouter);

// ─── WhatsApp Settings ────────────────────────────────────────────────────────
router.get('/:slug/whatsapp-settings', staffAuth, tenantController.getWhatsappSettings);
router.put('/:slug/whatsapp-settings', staffAuth, tenantController.updateWhatsappSettings);
router.get('/:slug/whatsapp-balance', staffAuth, tenantController.getWhatsappBalance);
router.get('/:slug/whatsapp-templates', staffAuth, tenantController.getWhatsappTemplates);
router.post('/:slug/whatsapp-templates', staffAuth, tenantController.createWhatsappTemplate);
router.delete('/:slug/whatsapp-templates', staffAuth, tenantController.deleteWhatsappTemplate);

// ─── WhatsApp Media Upload ────────────────────────────────────────────────────
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
router.post('/:slug/whatsapp-upload-media', staffAuth, upload.single('file'), tenantController.uploadWhatsappMedia);
router.post('/:slug/whatsapp-local-upload', staffAuth, upload.single('file'), (req, res, next) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const { slug } = req.params;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const uploadsDir = path.join(__dirname, "..", "public", "uploads", slug, "campaigns");
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const ext = path.extname(file.originalname);
        const filename = `media_${Date.now()}${ext}`;
        const filePath = path.join(uploadsDir, filename);

        fs.writeFileSync(filePath, file.buffer);

        const hostUrl = process.env.IMAGE_URL || `${req.protocol}://${req.get('host')}`;
        const publicUrl = `${hostUrl}/uploads/${slug}/campaigns/${filename}`.replace(/([^:]\/)\/+/g, '$1');

        res.status(200).json({ success: true, url: publicUrl });
    } catch (err) {
        next(err);
    }
});

router.post('/:slug/whatsapp-send-reminder', staffAuth, tenantController.sendWhatsappReminder);

// ─── WhatsApp Chat Panel (com.bot CRM API proxy) ─────────────────────────────
router.get('/:slug/whatsapp-chats', staffAuth, tenantController.getWhatsappChats);
router.get('/:slug/whatsapp-chats/:chatId/messages', staffAuth, tenantController.getWhatsappChatMessages);
router.post('/:slug/whatsapp-chats/:chatId/send', staffAuth, tenantController.sendWhatsappChatMessage);

// ─── WhatsApp Reminders ───────────────────────────────────────────────────────
const reminderController = require('../controller/reminderController');
router.get('/:slug/whatsapp-reminders', staffAuth, reminderController.getAllReminders);
router.post('/:slug/whatsapp-reminders', staffAuth, reminderController.createReminder);
router.put('/:slug/whatsapp-reminders/:id', staffAuth, reminderController.updateReminder);
router.delete('/:slug/whatsapp-reminders/:id', staffAuth, reminderController.deleteReminder);
router.post('/:slug/whatsapp-reminders/:id/retry', staffAuth, reminderController.retryReminder);

// ─── Clients ──────────────────────────────────────────────────────────────────
const clientController = require('../controller/clientController');
router.get('/:slug/clients', staffAuth, clientController.getAllClients);
router.post('/:slug/clients/bulk', staffAuth, clientController.bulkCreateClients);
router.post('/:slug/clients', staffAuth, clientController.createClient);
router.put('/:slug/clients/:id', staffAuth, clientController.updateClient);
router.delete('/:slug/clients/:id', staffAuth, clientController.deleteClient);

// ─── Customer Groups ──────────────────────────────────────────────────────────
const customerGroupController = require('../controller/customerGroupController');
router.get('/:slug/customer-groups', staffAuth, customerGroupController.getAllGroups);
router.post('/:slug/customer-groups', staffAuth, customerGroupController.createGroup);
router.put('/:slug/customer-groups/:id', staffAuth, customerGroupController.updateGroup);
router.delete('/:slug/customer-groups/:id', staffAuth, customerGroupController.deleteGroup);

// ─── Tickets ──────────────────────────────────────────────────────────────────
const ticketController = require('../controller/ticketController');
router.post('/:slug/tickets', staffAuth, ticketController.createTicket);
router.get('/:slug/tickets', staffAuth, ticketController.getTenantTickets);

module.exports = router;
