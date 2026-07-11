var express = require("express");
var router = express.Router();

router.use("/health", require("./health"));
router.use("/user", require("./user"));
router.use("/tenants", require("./tenantRoutes"));
router.use("/tickets", require("./ticketRoutes"));
router.use("/inquiries", require("./inquiryRoutes"));

module.exports = router;
