const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, _req, res, _next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // Log non-operational errors
  if (!err.isOperational) {
    logger.error(err);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const keys = Object.keys(err.keyPattern || err.keyValue || {});
    let message = `A record with that ${keys[0] || 'value'} already exists.`;
    if (keys.includes('seatNumber')) message = 'A seat with that number already exists in this section.';
    else if (keys.includes('email')) message = 'That email is already registered.';
    else if (keys.includes('name')) message = 'That name is already in use.';
    return res.status(409).json({ success: false, message });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join('. ') });
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: `Invalid ${err.path}: ${err.value}` });
  }

  res.status(err.statusCode).json({
    success: false,
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { AppError, errorHandler };
