const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, restrictTo } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const { cancelBooking, adminCheckIn } = require('../services/bookingService');
const { adminMarkPaid } = require('../services/paymentService');
const { audit } = require('../services/auditService');
const { notify } = require('../services/notificationService');
const email = require('../services/emailService');
const AuditLog = require('../models/AuditLog');
const { getSettings, updateSettings } = require('../services/settingsService');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Seat = require('../models/Seat');
const Section = require('../models/Section');
const Payment = require('../models/Payment');

const router = express.Router();
router.use(protect, restrictTo('admin'));

const handleValidation = (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return next(new AppError(errors.array()[0].msg, 400));
  next();
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DAY = 24 * 3600 * 1000;

// Shared filter for the bookings list, fines list and CSV export
const buildBookingFilter = async (q) => {
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.userId) filter.user = q.userId;
  if (q.seatId) filter.seat = q.seatId;
  if (q.sectionId) filter.section = q.sectionId;
  if (q.from || q.to) {
    filter.startTime = {};
    if (q.from) filter.startTime.$gte = new Date(q.from);
    if (q.to) filter.startTime.$lt = new Date(new Date(q.to).getTime() + DAY); // "to" is inclusive
  }
  if (q.hasFine === 'true') filter.fineAmount = { $gt: 0 };
  if (q.fineStatus === 'unpaid') Object.assign(filter, { fineAmount: { $gt: 0 }, finePaid: false, fineWaived: { $ne: true } });
  if (q.fineStatus === 'paid') Object.assign(filter, { fineAmount: { $gt: 0 }, finePaid: true });
  if (q.fineStatus === 'waived') Object.assign(filter, { fineAmount: { $gt: 0 }, fineWaived: true });
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    const users = await User.find({ $or: [{ name: rx }, { email: rx }, { studentId: rx }] }).select('_id').limit(200);
    filter.user = { $in: users.map((u) => u._id) };
  }
  return filter;
};

const populateAdmin = (query) =>
  query.populate('user', 'name email studentId').populate('seat', 'seatNumber').populate('section', 'name');

// GET /api/admin/bookings
router.get('/bookings', async (req, res, next) => {
  try {
    const filter = await buildBookingFilter(req.query);
    const lim = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const [bookings, total] = await Promise.all([
      populateAdmin(Booking.find(filter)).sort({ startTime: -1 }).skip((page - 1) * lim).limit(lim),
      Booking.countDocuments(filter),
    ]);
    res.json({ success: true, total, page, pages: Math.ceil(total / lim), bookings });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/bookings/:id
router.delete('/bookings/:id', async (req, res, next) => {
  try {
    const booking = await cancelBooking({ bookingId: req.params.id, requestingUser: req.user, reason: req.body.reason || 'Cancelled by admin' });
    audit(req, 'booking.cancel', 'Booking', booking._id, req.body.reason || 'Cancelled by admin');
    res.json({ success: true, message: 'Booking cancelled.', booking });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/fines - bookings with fines + totals
router.get('/fines', async (req, res, next) => {
  try {
    const filter = await buildBookingFilter({ ...req.query, hasFine: 'true' });
    const lim = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const [bookings, total, unpaid, collected] = await Promise.all([
      populateAdmin(Booking.find(filter)).sort({ updatedAt: -1 }).skip((page - 1) * lim).limit(lim),
      Booking.countDocuments(filter),
      Booking.aggregate([
        { $match: { fineAmount: { $gt: 0 }, finePaid: false, fineWaived: { $ne: true } } },
        { $group: { _id: null, amount: { $sum: '$fineAmount' }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    ]);
    res.json({
      success: true, total, page, pages: Math.ceil(total / lim), bookings,
      summary: {
        outstandingAmount: unpaid[0]?.amount || 0,
        outstandingCount: unpaid[0]?.count || 0,
        collectedAmount: collected[0]?.amount || 0,
        paymentsCount: collected[0]?.count || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/bookings/:id/mark-paid  { method }  - fine paid in cash at the desk
router.post('/bookings/:id/mark-paid', async (req, res, next) => {
  try {
    const payment = await adminMarkPaid({ bookingId: req.params.id, method: req.body.method || 'cash' });
    audit(req, 'fine.mark_paid', 'Booking', req.params.id, `₹${payment.amount} via ${payment.method}, receipt ${payment.receiptNo}`);
    res.json({ success: true, message: 'Fine marked as paid.', payment });
  } catch (err) { next(err); }
});

// PUT /api/admin/bookings/:id/waive-fine  { reason }
router.put('/bookings/:id/waive-fine', [body('reason').trim().notEmpty().withMessage('Reason is required')], handleValidation, async (req, res, next) => {
  try {
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, fineAmount: { $gt: 0 }, finePaid: false, fineWaived: { $ne: true } },
      { $set: { fineWaived: true, fineWaivedReason: req.body.reason } },
      { new: true }
    );
    if (!booking) return next(new AppError('No unpaid fine found on this booking.', 404));
    notify(booking.user, { type: 'success', message: `Your fine of ₹${booking.fineAmount} was waived by the library.` });
    audit(req, 'fine.waive', 'Booking', booking._id, `₹${booking.fineAmount}: ${req.body.reason}`);
    res.json({ success: true, message: 'Fine waived.', booking });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users?q=&isBlocked=
router.get('/users', async (req, res, next) => {
  try {
    const { role, isBlocked } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (isBlocked !== undefined) filter.isBlocked = isBlocked === 'true';
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(req.query.q), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { studentId: rx }];
    }
    const lim = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort({ createdAt: -1 }).skip((page - 1) * lim).limit(lim).lean(),
      User.countDocuments(filter),
    ]);

    // unpaid fine total per listed user
    const unpaid = await Booking.aggregate([
      { $match: { user: { $in: users.map((u) => u._id) }, fineAmount: { $gt: 0 }, finePaid: false, fineWaived: { $ne: true } } },
      { $group: { _id: '$user', amount: { $sum: '$fineAmount' } } },
    ]);
    const unpaidMap = Object.fromEntries(unpaid.map((u) => [u._id.toString(), u.amount]));
    users.forEach((u) => { u.unpaidFines = unpaidMap[u._id.toString()] || 0; });

    res.json({ success: true, total, page, pages: Math.ceil(total / lim), users });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id/block
router.put(
  '/users/:id/block',
  [
    body('isBlocked').isBoolean().withMessage('isBlocked must be a boolean'),
    body('reason').if(body('isBlocked').equals('true')).notEmpty().withMessage('Reason required when blocking'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { isBlocked, reason } = req.body;
      const user = await User.findById(req.params.id);
      if (!user) return next(new AppError('User not found.', 404));
      if (user.role === 'admin') return next(new AppError('Cannot block an admin.', 400));

      user.isBlocked = isBlocked;
      user.blockedReason = isBlocked ? reason : null;
      user.blockedAt = isBlocked ? new Date() : null;
      await user.save({ validateBeforeSave: false });
      audit(req, isBlocked ? 'user.block' : 'user.unblock', 'User', user._id, `${user.email}${isBlocked ? `: ${reason}` : ''}`);
      res.json({ success: true, message: `User ${isBlocked ? 'blocked' : 'unblocked'}.`, user: user.toSafeObject() });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/admin/email/status, POST /api/admin/email/test  - is email working?
router.get('/email/status', async (_req, res, next) => {
  try {
    res.json({ success: true, ...email.emailStatus(), ...(await email.emailLinkInfo()) });
  } catch (err) { next(err); }
});
router.post('/email/test', async (req, res, next) => {
  try {
    const typed = String(req.body.to || '').trim();
    if (typed && !/^\S+@\S+\.\S+$/.test(typed)) return next(new AppError('That does not look like an email address.', 400));
    const to = typed || req.user.email;
    const result = await email.sendTestEmail(req.user, to);
    audit(req, 'email.test', 'Email', '', result.sent ? `sent to ${to}` : `failed: ${result.error}`);
    res.json({ success: true, ...result, to });
  } catch (err) { next(err); }
});

// GET/PUT /api/admin/settings
router.get('/settings', async (_req, res, next) => {
  try {
    res.json({ success: true, settings: await getSettings() });
  } catch (err) {
    next(err);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    const settings = await updateSettings(req.body);
    audit(req, 'settings.update', 'Settings', 'global', Object.keys(req.body).join(', '));
    res.json({ success: true, message: 'Settings saved.', settings });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/bookings/:id/checkin  - manual check-in
router.post('/bookings/:id/checkin', async (req, res, next) => {
  try {
    const booking = await adminCheckIn({ bookingId: req.params.id });
    audit(req, 'booking.manual_checkin', 'Booking', booking._id, '');
    res.json({ success: true, message: 'Student checked in.', booking });
  } catch (err) { next(err); }
});

// POST /api/admin/users/import  { students: [{ name, email, studentId }] }
// Creates accounts with a random password and emails each student a "set your password" link.
router.post('/users/import', async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body.students) ? req.body.students.slice(0, 500) : [];
    if (!rows.length) return next(new AppError('No students to import.', 400));
    const crypto2 = crypto;
    const created = [];
    const failed = [];
    for (const [i, r] of rows.entries()) {
      const name = String(r.name || '').trim();
      const mail = String(r.email || '').trim().toLowerCase();
      const studentId = r.studentId ? String(r.studentId).trim().toUpperCase() : undefined;
      if (!name || !/^\S+@\S+\.\S+$/.test(mail)) { failed.push({ row: i + 1, email: mail, reason: 'Name or email is invalid' }); continue; }
      try {
        if (await User.findOne({ $or: [{ email: mail }, ...(studentId ? [{ studentId }] : [])] })) {
          failed.push({ row: i + 1, email: mail, reason: 'Email or student ID already exists' });
          continue;
        }
        const user = await User.create({ name, email: mail, studentId, password: `${crypto2.randomBytes(9).toString('base64url')}A1`, role: 'student' });
        const raw = crypto2.randomBytes(32).toString('hex');
        user.passwordResetToken = crypto2.createHash('sha256').update(raw).digest('hex');
        user.passwordResetExpires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
        await user.save({ validateBeforeSave: false });
        email.sendPasswordResetEmail(user, raw);
        created.push({ name, email: mail, studentId, setPasswordUrl: email.emailEnabled() || process.env.NODE_ENV === 'production' ? undefined : `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${raw}` });
      } catch (err) {
        failed.push({ row: i + 1, email: mail, reason: err.message });
      }
    }
    audit(req, 'user.import', 'User', '', `${created.length} created, ${failed.length} failed`);
    res.status(201).json({ success: true, created, failed });
  } catch (err) { next(err); }
});

// GET /api/admin/audit?page=&action=
router.get('/audit', async (req, res, next) => {
  try {
    const lim = Math.min(parseInt(req.query.limit, 10) || 25, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const filter = {};
    if (req.query.action) filter.action = new RegExp(`^${escapeRegex(req.query.action)}`);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * lim).limit(lim).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ success: true, total, page, pages: Math.ceil(total / lim), logs });
  } catch (err) { next(err); }
});

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// GET /api/admin/analytics
router.get('/analytics', async (_req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(todayStart.getTime() + DAY);
    const weekStart = new Date(todayStart.getTime() - 6 * DAY);
    const monthAgo = new Date(now.getTime() - 30 * DAY);

    const [
      totalSeats, maintenanceSeats, runningNow, todayBookings, weekBookings, upcoming,
      totalUsers, blockedUsers, statusBreakdown, recent, sections, seatCounts, unpaid, collected, noShowLeaders,
    ] = await Promise.all([
      Seat.countDocuments(),
      Seat.countDocuments({ isMaintenance: true }),
      Booking.find({ status: 'active', startTime: { $lte: now }, endTime: { $gt: now } }).select('seat section').lean(),
      Booking.countDocuments({ startTime: { $gte: todayStart, $lt: tomorrow }, status: { $ne: 'cancelled' } }),
      Booking.countDocuments({ startTime: { $gte: weekStart, $lt: tomorrow }, status: { $ne: 'cancelled' } }),
      Booking.countDocuments({ status: 'active', startTime: { $gt: now } }),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ isBlocked: true }),
      Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Booking.find({ startTime: { $gte: monthAgo }, status: { $ne: 'cancelled' } }).select('startTime').limit(20000).lean(),
      Section.find().lean(),
      Seat.aggregate([{ $group: { _id: '$section', total: { $sum: 1 }, maintenance: { $sum: { $cond: ['$isMaintenance', 1, 0] } } } }]),
      Booking.aggregate([
        { $match: { fineAmount: { $gt: 0 }, finePaid: false, fineWaived: { $ne: true } } },
        { $group: { _id: null, amount: { $sum: '$fineAmount' }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
      Booking.aggregate([
        { $match: { status: 'no_show', startTime: { $gte: monthAgo } } },
        { $group: { _id: '$user', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
        { $project: { count: 1, name: { $arrayElemAt: ['$u.name', 0] }, email: { $arrayElemAt: ['$u.email', 0] }, studentId: { $arrayElemAt: ['$u.studentId', 0] } } },
      ]),
    ]);

    const occupiedSeatIds = new Set(runningNow.map((b) => b.seat.toString()));
    const occupiedBySection = {};
    runningNow.forEach((b) => {
      const k = b.section.toString();
      occupiedBySection[k] = (occupiedBySection[k] || 0) + 1;
    });

    // bookings per day (last 7 days) and by start hour (last 30 days)
    const perDayMap = {};
    for (let i = 6; i >= 0; i -= 1) perDayMap[dayKey(new Date(todayStart.getTime() - i * DAY))] = 0;
    const peakHours = Array(24).fill(0);
    recent.forEach((b) => {
      const k = dayKey(b.startTime);
      if (k in perDayMap) perDayMap[k] += 1;
      peakHours[b.startTime.getHours()] += 1;
    });
    const perDay = Object.entries(perDayMap).map(([date, count]) => ({
      date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' }),
      count,
    }));

    const countsBySection = Object.fromEntries(seatCounts.map((s) => [String(s._id), s]));
    const sectionStats = sections.map((s) => {
      const c = countsBySection[s._id.toString()] || { total: 0, maintenance: 0 };
      return { id: s._id, name: s.name, total: c.total, maintenance: c.maintenance, occupied: occupiedBySection[s._id.toString()] || 0 };
    });

    const bookable = totalSeats - maintenanceSeats;
    res.json({
      success: true,
      analytics: {
        seats: { total: totalSeats, maintenance: maintenanceSeats, bookable, occupiedNow: occupiedSeatIds.size, availableNow: Math.max(bookable - occupiedSeatIds.size, 0) },
        bookings: {
          today: todayBookings,
          thisWeek: weekBookings,
          upcoming,
          statusBreakdown: statusBreakdown.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
          perDay,
          peakHours,
        },
        sections: sectionStats,
        noShowLeaders,
        users: { total: totalUsers, blocked: blockedUsers },
        fines: { outstandingAmount: unpaid[0]?.amount || 0, outstandingCount: unpaid[0]?.count || 0, collectedAmount: collected[0]?.amount || 0 },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/export/bookings  (CSV; same filters as the bookings list)
router.get('/export/bookings', async (req, res, next) => {
  try {
    const filter = await buildBookingFilter(req.query);
    const bookings = await populateAdmin(Booking.find(filter)).sort({ startTime: -1 }).limit(10000).lean();

    const cell = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      // prefix formula-like values so spreadsheets do not execute them
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const header = ['Booking ID', 'Student', 'Email', 'Student ID', 'Section', 'Seat', 'Start', 'End', 'Status', 'Checked in', 'Fine (INR)', 'Fine paid', 'Fine waived', 'Fine reason'];
    const rows = bookings.map((b) => [
      b._id, b.user?.name, b.user?.email, b.user?.studentId, b.section?.name, b.seat?.seatNumber,
      b.startTime?.toISOString(), b.endTime?.toISOString(), b.status, b.checkInTime ? 'yes' : 'no',
      b.fineAmount || 0, b.finePaid ? 'yes' : 'no', b.fineWaived ? 'yes' : 'no', b.fineReason,
    ]);
    const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\ufeff${csv}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;