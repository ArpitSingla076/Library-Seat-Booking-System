const mongoose = require('mongoose');
const logger = require('../utils/logger');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  const conn = await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  isConnected = true;
  logger.info(`MongoDB connected: ${conn.connection.host}`);
};

module.exports = { connectDB };
