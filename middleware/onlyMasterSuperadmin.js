const mongoose = require("mongoose");

module.exports = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ status: "Fail", message: "Unauthorized" });
    }

    // Check if the user is the master superadmin
    let isMaster = false;
    if (req.user.isMaster) {
        isMaster = true;
    } else {
        // Fallback: check if they are the oldest user in the collection
        try {
            const oldestUser = await mongoose.model("User").findOne().sort({ createdAt: 1 });
            if (oldestUser && String(oldestUser._id) === String(req.user._id)) {
                isMaster = true;
            }
        } catch (err) {
            console.error("Error finding oldest user:", err);
        }
    }

    if (!isMaster) {
        return res.status(403).json({
            status: "Fail",
            message: "Forbidden: Only the Master Superadmin is authorized to perform this operation."
        });
    }

    next();
};
