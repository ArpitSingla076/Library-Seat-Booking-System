const winston = require('winston');

const transports = [
  new winston.transports.Console()
];

// Only write to files in development
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

const logger = winston.createLogger({
  level: 'info', // Show info logs in production to see server status
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) =>
      stack
        ? `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`
        : `${timestamp} [${level.toUpperCase()}]: ${message}`
    )
  ),
  transports,
});

module.exports = logger;
