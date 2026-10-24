const crypto = require('crypto');
const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const email = require('../services/emailService');
const { generateSecret, verifyTotp, otpauthUrl } = require('../utils/totp');

const router = express.Router();

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const REFRESH_DAYS = 7;
const emailOpts = { gmail_remove_dots: false };

const signAccess = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '1h' });

// Issues a short-lived access token + a rotating refresh token (stored hashed).
const issueTokens = async (user) => {
  const raw = crypto.randomBytes(40).toString('hex');
  const now = new Date();
  const kept = (user.refreshTokens || []).filter((t) => t.expiresAt > now).slice(-4);
  user.refreshTokens = [...kept, { tokenHash: sha(raw), expiresAt: new Date(now.getTime() + REFRESH_DAYS * 86400000) }];
  await user.save({ validateBeforeSave: false });
  return { token: signAccess(user._id), refreshToken: raw };
};

const handleValidation = (req, _res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return next(new AppError(errors.array()[0].msg, 400));
  next();
};

const passwordRule = (field) =>
  body(field)
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must include at least one letter and one number');

const createVerifyToken = async (user) => {
  const raw = crypto.randomBytes(32).toString('hex');
  user.emailVerifyToken = sha(raw);
  user.emailVerifyExpires = new Date(Date.now() + 24 * 3600 * 1000);
  await user.save({ validateBeforeSave: false });
  return raw;
};

// POST /api/auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(emailOpts),
    passwordRule('password'),
    body('studentId').optional().trim(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, email: mail, password } = req.body;
      const studentId = req.body.studentId ? String(req.body.studentId).trim().toUpperCase() : undefined;
      if (studentId && (await User.findOne({ studentId }))) return next(new AppError('That student ID is already registered.', 409));
      if (await User.findOne({ email: mail })) return next(new AppError('Email already registered.', 409));

      const user = await User.create({ name, email: mail, password, studentId });
      const verifyToken = await createVerifyToken(user);
      email.sendVerificationEmail(user, verifyToken);
      const tokens = await issueTokens(user);

      res.status(201).json({ success: true, ...tokens, user: user.toSafeObject() });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [body('password').notEmpty().withMessage('Password is required')],
  handleValidation,
  async (req, res, next) => {
    try {
      // "identifier" can be an email address or a student ID (legacy "email" field still accepted)
      const identifier = String(req.body.identifier || req.body.email || '').trim();
      if (!identifier) return next(new AppError('Email or student ID is required.', 400));
      const query = identifier.includes('@')
        ? { email: identifier.toLowerCase() }
        : { studentId: identifier.toUpperCase() };

      const user = await User.findOne(query).select('+password +refreshTokens +twoFactorSecret');
      if (!user || !(await user.comparePassword(req.body.password))) {
        return next(new AppError('Invalid email / student ID or password.', 401));
      }
      if (user.isBlocked) return next(new AppError(`Account blocked: ${user.blockedReason || 'Contact admin.'}`, 403));

      if (user.twoFactorEnabled) {
        if (!req.body.otp) {
          return res.status(401).json({ success: false, requireOtp: true, message: 'Enter the 6-digit code from your authenticator app.' });
        }
        if (!verifyTotp(user.twoFactorSecret, req.body.otp)) {
          return res.status(401).json({ success: false, requireOtp: true, message: 'Invalid authentication code.' });
        }
      }

      user.lastLogin = new Date();
      const tokens = await issueTokens(user);
      res.json({ success: true, ...tokens, user: user.toSafeObject() });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/refresh  { refreshToken } -> new access + refresh token (old refresh token is revoked)
router.post('/refresh', async (req, res, next) => {
  try {
    const raw = req.body.refreshToken;
    if (!raw || typeof raw !== 'string') return next(new AppError('Refresh token required.', 401));
    const hash = sha(raw);
    const user = await User.findOne({ 'refreshTokens.tokenHash': hash }).select('+refreshTokens');
    const entry = user?.refreshTokens.find((t) => t.tokenHash === hash);
    if (!user || !entry || entry.expiresAt < new Date()) return next(new AppError('Session expired. Please log in again.', 401));
    if (user.isBlocked) return next(new AppError('Your account has been blocked. Contact admin.', 403));

    user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== hash);
    const tokens = await issueTokens(user);
    res.json({ success: true, ...tokens });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout  { refreshToken } -> revoke it
router.post('/logout', async (req, res, next) => {
  try {
    const raw = req.body.refreshToken;
    if (raw && typeof raw === 'string') {
      await User.updateOne({ 'refreshTokens.tokenHash': sha(raw) }, { $pull: { refreshTokens: { tokenHash: sha(raw) } } });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject() });
});

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  [body('email').isEmail().withMessage('Valid email is required').normalizeEmail(emailOpts)],
  handleValidation,
  async (req, res, next) => {
    try {
      const generic = { success: true, message: 'If that email is registered, a reset link has been sent.' };
      const user = await User.findOne({ email: req.body.email });
      if (!user) return res.json(generic);

      const raw = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = sha(raw);
      user.passwordResetExpires = new Date(Date.now() + 3600 * 1000);
      await user.save({ validateBeforeSave: false });
      email.sendPasswordResetEmail(user, raw);

      // Development convenience when no SMTP server is configured
      if (process.env.NODE_ENV !== 'production' && !email.emailEnabled()) {
        generic.devResetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password/${raw}`;
      }
      res.json(generic);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/reset-password  { token, password }
router.post(
  '/reset-password',
  [body('token').notEmpty().withMessage('Reset token is required'), passwordRule('password')],
  handleValidation,
  async (req, res, next) => {
    try {
      const user = await User.findOne({
        passwordResetToken: sha(req.body.token),
        passwordResetExpires: { $gt: new Date() },
      }).select('+passwordResetToken +passwordResetExpires +refreshTokens');
      if (!user) return next(new AppError('Reset link is invalid or has expired.', 400));

      user.password = req.body.password;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      user.refreshTokens = [];
      await user.save();
      res.json({ success: true, message: 'Password updated. You can now log in.' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/change-password  { currentPassword, newPassword }
router.post(
  '/change-password',
  protect,
  [body('currentPassword').notEmpty().withMessage('Current password is required'), passwordRule('newPassword')],
  handleValidation,
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id).select('+password +refreshTokens');
      if (!(await user.comparePassword(req.body.currentPassword))) {
        return next(new AppError('Current password is incorrect.', 400));
      }
      if (req.body.currentPassword === req.body.newPassword) {
        return next(new AppError('New password must be different from the current one.', 400));
      }
      user.password = req.body.newPassword;
      user.refreshTokens = [];
      await user.save();
      const tokens = await issueTokens(user); // keep this session signed in
      res.json({ success: true, message: 'Password changed.', ...tokens });
    } catch (err) {
      next(err);
    }
  }
);

// ---- Two-factor authentication (authenticator app) ----
// POST /api/auth/2fa/setup -> secret + otpauth URL (not active until confirmed)
router.post('/2fa/setup', protect, async (req, res, next) => {
  try {
    if (req.user.twoFactorEnabled) return next(new AppError('Two-factor authentication is already enabled.', 400));
    const secret = generateSecret();
    await User.updateOne({ _id: req.user._id }, { $set: { twoFactorSecret: secret } });
    res.json({ success: true, secret, otpauthUrl: otpauthUrl(req.user.email, secret) });
  } catch (err) { next(err); }
});

// POST /api/auth/2fa/enable { code }
router.post('/2fa/enable', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    if (!user.twoFactorSecret) return next(new AppError('Start setup first.', 400));
    if (!verifyTotp(user.twoFactorSecret, req.body.code)) return next(new AppError('That code is not correct. Try again.', 400));
    user.twoFactorEnabled = true;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Two-factor authentication enabled.' });
  } catch (err) { next(err); }
});

// POST /api/auth/2fa/disable { password, code }
router.post('/2fa/disable', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+password +twoFactorSecret');
    if (!(await user.comparePassword(req.body.password || ''))) return next(new AppError('Password is incorrect.', 400));
    if (!verifyTotp(user.twoFactorSecret, req.body.code)) return next(new AppError('That code is not correct.', 400));
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Two-factor authentication disabled.' });
  } catch (err) { next(err); }
});

// POST /api/auth/verify-email  { token }
router.post('/verify-email', [body('token').notEmpty()], handleValidation, async (req, res, next) => {
  try {
    const user = await User.findOne({
      emailVerifyToken: sha(req.body.token),
      emailVerifyExpires: { $gt: new Date() },
    }).select('+emailVerifyToken +emailVerifyExpires');
    if (!user) return next(new AppError('Verification link is invalid or has expired.', 400));

    user.emailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Email verified.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', protect, async (req, res, next) => {
  try {
    if (req.user.emailVerified) return next(new AppError('Email is already verified.', 400));
    const raw = await createVerifyToken(req.user);
    email.sendVerificationEmail(req.user, raw);
    const body = { success: true, message: 'Verification email sent.' };
    if (process.env.NODE_ENV !== 'production' && !email.emailEnabled()) {
      body.devVerifyUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify-email/${raw}`;
    }
    res.json(body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
