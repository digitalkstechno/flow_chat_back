
const express = require('express');
const router = express.Router({ mergeParams: true }); // mergeParams so :slug flows in
const staffController = require('../controller/staff');
const staffAuth = require('../middleware/staffAuth');

/**
 * All routes here are mounted under:
 *   /v1/api/tenants/:slug/staff
 */

// ── Public (no auth) ──────────────────────────────────────────────────────────
// Staff login
router.post('/login', staffController.staffLogin);
// Staff forgot password
router.post('/forgot-password', staffController.staffForgotPassword);

// ── Protected (staff must be logged in) ──────────────────────────────────────
// Get own profile
router.get('/me', staffAuth, staffController.getStaffProfile);

const readOnlyForStaff = require('../middleware/readOnlyForStaff');

// ── Admin/SuperAdmin only ───────────────────────────────────────────────────
// Create a staff member
router.post('/create', staffAuth, readOnlyForStaff, staffController.createStaff);

// List all staff  
router.get('/', staffAuth, staffController.fetchAllStaff);

// Get, update, delete a specific staff member
router.get('/:id', staffAuth, staffController.fetchStaffById);
router.put('/:id', staffAuth, readOnlyForStaff, staffController.updateStaff);
router.delete('/:id', staffAuth, readOnlyForStaff, staffController.deleteStaff);

// ── SuperAdmin Protected ─────────────────────────────────────────────────────
const auth = require('../middleware/auth');
router.post('/impersonate', auth, staffController.staffImpersonate);

module.exports = router;
