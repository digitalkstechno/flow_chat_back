const Tenant = require('../model/Tenant');
const { getTenantConnection } = require('./tenantDbManager');
const { getReminderModel } = require('../model/Reminder');
const { getClientModel } = require('../model/Client');
const { decrypt } = require('./encryption');
const axios = require('axios');

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

const sendSingleReminderImmediately = async (tenant, reminder) => {
    try {
        if (!tenant.whatsappAccessToken || !tenant.whatsappPhoneNumberId) {
            throw new Error('WhatsApp credentials are not configured');
        }

        const costPerMessage = 0.72;
        const currentBalance = tenant.whatsappBalance !== undefined ? tenant.whatsappBalance : 5000.00;
        if (currentBalance < costPerMessage) {
            throw new Error('Insufficient WhatsApp balance');
        }

        const token = decrypt(tenant.whatsappAccessToken);
        const cleanBaseUrl = normalizeApiBaseUrl(tenant.whatsappApiBaseUrl);

        // Resolve phone number if not directly provided in newPhone
        let targetPhone = '';
        let targetName = 'Customer';

        if (reminder.recipientType === 'new') {
            targetPhone = reminder.newPhone || '';
            targetName = reminder.newName || 'Customer';
        } else if (reminder.recipientType === 'customers') {
            let customerObj = reminder.customer;
            if (customerObj && typeof customerObj === 'object' && customerObj.phone) {
                targetPhone = customerObj.phone;
                targetName = customerObj.fullName || 'Customer';
            } else if (customerObj) {
                const conn = await getTenantConnection(tenant.slug);
                const Client = getClientModel(conn);
                const client = await Client.findById(customerObj);
                if (client) {
                    targetPhone = client.phone;
                    targetName = client.fullName;
                }
            }
        } else {
            targetPhone = reminder.newPhone || '';
        }

        // Normalize phone number
        targetPhone = targetPhone ? targetPhone.replace(/\D/g, '') : '';
        if (!targetPhone.startsWith('91') && targetPhone.length === 10) {
            targetPhone = '91' + targetPhone;
        }

        if (!targetPhone) {
            throw new Error('Recipient phone number is missing');
        }

        const bodyParameters = (reminder.parameters || []).map(param => ({
            type: 'text',
            text: param
        }));

        const payload = {
            messaging_product: 'whatsapp',
            to: targetPhone,
            type: 'template',
            template: {
                name: reminder.templateName,
                language: {
                    code: reminder.languageCode || 'en_US'
                }
            }
        };

        const components = [];

        // Build header parameter component
        if (reminder.headerLink && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(reminder.headerFormat)) {
            const formatLower = reminder.headerFormat.toLowerCase();
            let linkUrl = reminder.headerLink;
            let finalFormat = formatLower;

            if (linkUrl.startsWith('http://')) {
                linkUrl = 'https://directory.surateastbuildersassociation.com/images/logo.png';
                finalFormat = 'image';
            }

            const headerParam = {
                type: 'header',
                parameters: [
                    {
                        type: finalFormat,
                        [finalFormat]: {
                            link: linkUrl
                        }
                    }
                ]
            };
            if (finalFormat === 'document') {
                headerParam.parameters[0].document.filename = reminder.title ? `${reminder.title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf` : 'document.pdf';
            }
            components.push(headerParam);
        }

        if (bodyParameters.length > 0) {
            components.push({
                type: 'body',
                parameters: bodyParameters
            });
        }

        if (components.length > 0) {
            payload.template.components = components;
        }

        const requestUrl = `${cleanBaseUrl}/${tenant.whatsappPhoneNumberId}/messages`;

        console.log(`[WhatsApp Sender] Sending template message request:`);
        console.log(`- Request URL: ${requestUrl}`);
        console.log(`- Payload JSON:`, JSON.stringify(payload, null, 2));

        const response = await axios.post(requestUrl, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`[WhatsApp Sender] Meta API Success Response Status: ${response.status}`);
        console.log(`[WhatsApp Sender] Response Data:`, JSON.stringify(response.data, null, 2));

        if (response.data && response.data.success === false) {
            throw new Error(response.data.error || 'Meta API returned success: false');
        }

        // Decrement balance
        const newBalance = Math.max(0, currentBalance - costPerMessage);
        tenant.whatsappBalance = Number(newBalance.toFixed(2));
        await tenant.save();

        return { success: true };
    } catch (err) {
        console.error(`[Scheduler] Failed to send reminder ${reminder._id || ''}:`, err.response?.data || err.message);
        if (err.response) {
            console.error(`- Response status: ${err.response.status}`);
            console.error(`- Response error details:`, JSON.stringify(err.response.data, null, 2));
        }
        return { success: false, error: err.response?.data?.error?.message || err.message };
    }
};

const runSchedulerTick = async () => {
    try {
        const activeTenants = await Tenant.find({ status: 'active' });
        for (const tenant of activeTenants) {
            try {
                if (!tenant.clusterConnectionString) continue;

                const conn = await getTenantConnection(tenant.slug);
                const Reminder = getReminderModel(conn);
                const Client = getClientModel(conn);

                // Find due reminders
                const dueReminders = await Reminder.find({
                    status: 'Scheduled',
                    scheduledAt: { $lte: new Date() }
                });

                for (const reminder of dueReminders) {
                    // Temporarily mark as Pending to prevent overlapping runs
                    reminder.status = 'Pending';
                    await reminder.save();

                    let recipients = [];

                    if (reminder.recipientType === 'new') {
                        if (reminder.newPhone) {
                            recipients = [{ phone: reminder.newPhone, name: reminder.newName || 'Customer' }];
                        }
                    } else if (reminder.recipientType === 'customers') {
                        if (reminder.customer) {
                            const client = await Client.findById(reminder.customer);
                            if (client && client.serviceStatus === 'ON') {
                                recipients = [{ phone: client.phone, name: client.fullName }];
                            }
                        }
                    } else if (reminder.recipientType === 'groups') {
                        const allClients = await Client.find().populate('group').lean();
                        let groupClients = [];
                        
                        if (reminder.groupName === 'All Clients') {
                            groupClients = allClients;
                        } else if (reminder.groupName === 'Pending Payments') {
                            groupClients = allClients.filter(c => c.paymentStatus === 'PENDING');
                        } else if (reminder.groupName === 'Clear Payments') {
                            groupClients = allClients.filter(c => c.paymentStatus === 'CLEAR');
                        } else if (reminder.groupName === 'Active Services') {
                            groupClients = allClients.filter(c => c.serviceStatus === 'ON');
                        } else if (reminder.groupName === 'Inactive Services') {
                            groupClients = allClients.filter(c => c.serviceStatus === 'OFF');
                        } else {
                            groupClients = allClients.filter(c => c.group && c.group._id.toString() === reminder.groupName.toString());
                        }

                        recipients = groupClients
                            .filter(c => c.serviceStatus === 'ON')
                            .map(c => ({ phone: c.phone, name: c.fullName }));
                    }

                    if (recipients.length === 0) {
                        reminder.status = 'Failed';
                        await reminder.save();
                        continue;
                    }

                    let anySuccess = false;
                    let lastError = '';

                    for (const recipient of recipients) {
                        // Dynamic parameters replacement
                        const resolvedParams = (reminder.parameters || []).map(p => {
                            if (typeof p === 'string') {
                                return p.replace(/\{\{clientName\}\}/gi, recipient.name);
                            }
                            return p;
                        });

                        const sendRes = await sendSingleReminderImmediately(tenant, {
                            ...reminder.toObject(),
                            newPhone: recipient.phone,
                            parameters: resolvedParams
                        });

                        if (sendRes.success) {
                            anySuccess = true;
                        } else {
                            lastError = sendRes.error;
                        }
                    }

                    // Rescheduling if repeat is enabled
                    if (reminder.repeat && reminder.repeat.enabled) {
                        const nextDate = new Date(reminder.scheduledAt);
                        const interval = reminder.repeat.interval || 1;

                        if (reminder.repeat.frequency === 'day') {
                            nextDate.setDate(nextDate.getDate() + interval);
                        } else if (reminder.repeat.frequency === 'week') {
                            nextDate.setDate(nextDate.getDate() + 7 * interval);
                        } else if (reminder.repeat.frequency === 'month') {
                            nextDate.setMonth(nextDate.getMonth() + interval);
                        } else if (reminder.repeat.frequency === 'year') {
                            nextDate.setFullYear(nextDate.getFullYear() + interval);
                        }

                        // Verify if it exceeds endDate
                        if (reminder.repeat.endDate && nextDate > new Date(reminder.repeat.endDate)) {
                            reminder.status = anySuccess ? 'Sent' : 'Failed';
                        } else {
                            reminder.scheduledAt = nextDate;
                            reminder.status = 'Scheduled';
                        }
                    } else {
                        reminder.status = anySuccess ? 'Sent' : 'Failed';
                    }

                    await reminder.save();
                }
            } catch (tenantErr) {
                console.error(`[Scheduler] Tenant processing failed for ${tenant.slug}:`, tenantErr.message);
            }
        }
    } catch (globalErr) {
        console.error('[Scheduler] Tick failed globally:', globalErr.message);
    }
};

const startScheduler = () => {
    // Polling interval is set to 30 seconds
    setInterval(runSchedulerTick, 30000);
    console.log('⏰ Background WhatsApp Reminder Scheduler running every 30s');
};

module.exports = {
    startScheduler,
    sendSingleReminderImmediately
};
