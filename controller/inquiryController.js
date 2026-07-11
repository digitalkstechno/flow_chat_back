const Inquiry = require('../model/Inquiry');

exports.createInquiry = async (req, res, next) => {
    try {
        const { name, email, phone, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ success: false, message: 'name, email, and message are required' });
        }

        const inquiry = await Inquiry.create({
            name,
            email,
            phone,
            message,
            status: 'new'
        });

        res.status(201).json({ success: true, data: inquiry });
    } catch (error) {
        next(error);
    }
};

exports.getAllInquiries = async (req, res, next) => {
    try {
        const inquiries = await Inquiry.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: inquiries });
    } catch (error) {
        next(error);
    }
};

exports.resolveInquiry = async (req, res, next) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);
        if (!inquiry) {
            return res.status(404).json({ success: false, message: 'Inquiry not found' });
        }

        inquiry.status = inquiry.status === 'new' ? 'resolved' : 'new';
        await inquiry.save();

        res.status(200).json({ success: true, data: inquiry });
    } catch (error) {
        next(error);
    }
};

exports.deleteInquiry = async (req, res, next) => {
    try {
        const inquiry = await Inquiry.findById(req.params.id);
        if (!inquiry) {
            return res.status(404).json({ success: false, message: 'Inquiry not found' });
        }

        await Inquiry.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Inquiry deleted successfully' });
    } catch (error) {
        next(error);
    }
};
