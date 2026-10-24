const Notification = require('../models/Notification');
const { emitToUser } = require('../config/socket');
const logger = require('../utils/logger');

/** Save an in-app notification and push it live to the user's open browser tabs. */
const notify = async (userId, { type = 'info', message }) => {
  if (!userId || !message) return null;
  try {
    const n = await Notification.create({ user: userId, type, message });
    emitToUser(userId, 'notification', { _id: n._id, type, message, createdAt: n.createdAt });
    return n;
  } catch (err) {
    logger.error(`notify failed: ${err.message}`);
    return null;
  }
};

module.exports = { notify };
