const express = require('express');
const router = express.Router();
const inquiryController = require('../controller/inquiryController');
const auth = require('../middleware/auth'); // Superadmin auth

router.post('/', inquiryController.createInquiry);
router.get('/', auth, inquiryController.getAllInquiries);
router.put('/:id/resolve', auth, inquiryController.resolveInquiry);
router.delete('/:id', auth, inquiryController.deleteInquiry);

module.exports = router;
