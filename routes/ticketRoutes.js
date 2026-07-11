const express = require('express');
const router = express.Router();
const ticketController = require('../controller/ticketController');
const auth = require('../middleware/auth'); // Superadmin auth

router.get('/', auth, ticketController.getAllTickets);
router.put('/:id/resolve', auth, ticketController.resolveTicket);
router.delete('/:id', auth, ticketController.deleteTicket);

module.exports = router;
