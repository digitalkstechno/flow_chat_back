const Ticket = require('../model/Ticket');
const Tenant = require('../model/Tenant');

exports.createTicket = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const { subject, description } = req.body;

        if (!subject || !description) {
            return res.status(400).json({ success: false, message: 'subject and description are required' });
        }

        const tenant = await Tenant.findOne({ slug }).lean();
        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        const ticket = await Ticket.create({
            tenantSlug: slug,
            tenantName: tenant.clientName,
            subject,
            description,
            raisedBy: req.staff.email
        });

        res.status(201).json({ success: true, data: ticket });
    } catch (error) {
        next(error);
    }
};

exports.getTenantTickets = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const tickets = await Ticket.find({ tenantSlug: slug }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: tickets });
    } catch (error) {
        next(error);
    }
};

exports.getAllTickets = async (req, res, next) => {
    try {
        let filter = {};
        if (req.user && req.user.role === 'affiliate') {
            const tenants = await Tenant.find({ createdBy: req.user._id }).select('slug').lean();
            const slugs = tenants.map(t => t.slug);
            filter = { tenantSlug: { $in: slugs } };
        }

        const tickets = await Ticket.find(filter).sort({ createdAt: -1 }).lean();

        // Fetch tenants to map dealer details
        const tenantsInfo = await Tenant.find().populate('createdBy', 'fullName email').lean();
        const tenantMap = tenantsInfo.reduce((acc, t) => {
            acc[t.slug] = t;
            return acc;
        }, {});

        const enrichedTickets = tickets.map(ticket => {
            const tenant = tenantMap[ticket.tenantSlug];
            return {
                ...ticket,
                dealer: tenant && tenant.createdBy ? {
                    _id: tenant.createdBy._id,
                    fullName: tenant.createdBy.fullName,
                    email: tenant.createdBy.email
                } : null
            };
        });

        res.status(200).json({ success: true, data: enrichedTickets });
    } catch (error) {
        next(error);
    }
};

exports.resolveTicket = async (req, res, next) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        if (req.user && req.user.role === 'affiliate') {
            const tenant = await Tenant.findOne({ slug: ticket.tenantSlug }).lean();
            if (!tenant || !tenant.createdBy || String(tenant.createdBy) !== String(req.user._id)) {
                return res.status(403).json({ success: false, message: "Forbidden: You are not authorized to resolve this ticket." });
            }
        }

        ticket.status = ticket.status === 'open' ? 'resolved' : 'open';
        await ticket.save();
        res.status(200).json({ success: true, data: ticket });
    } catch (error) {
        next(error);
    }
};

exports.deleteTicket = async (req, res, next) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        if (req.user && req.user.role === 'affiliate') {
            const tenant = await Tenant.findOne({ slug: ticket.tenantSlug }).lean();
            if (!tenant || !tenant.createdBy || String(tenant.createdBy) !== String(req.user._id)) {
                return res.status(403).json({ success: false, message: "Forbidden: You are not authorized to delete this ticket." });
            }
        }

        await Ticket.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Ticket deleted successfully' });
    } catch (error) {
        next(error);
    }
};
