const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/** Record an admin action. Never throws into the request. */
const audit = async (req, action, targetType, targetId, details = '') => {
  try {
    await AuditLog.create({
      admin: req.user._id,
      adminName: req.user.name,
      action,
      targetType,
      targetId: targetId ? String(targetId) : undefined,
      details: String(details).slice(0, 500),
      ip: req.ip,
    });
  } catch (err) {
    logger.error(`audit failed: ${err.message}`);
  }
};

module.exports = { audit };
