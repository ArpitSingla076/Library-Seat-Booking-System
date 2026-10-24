const express = require('express');
const { protect } = require('../middleware/auth');
const Notification = require('../models/Notification');

const router = express.Router();
router.use(protect);

// GET /api/notifications?limit=
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const [notifications, unread] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(limit),
      Notification.countDocuments({ user: req.user._id, read: false }),
    ]);
    res.json({ success: true, notifications, unread });
  } catch (err) { next(err); }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { read: true } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.delete('/', async (req, res, next) => {
  try {
    await Notification.deleteMany({ user: req.user._id });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
