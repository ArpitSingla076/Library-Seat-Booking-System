const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        const allowedOrigins = [
          'http://localhost:5173',
          'http://localhost:5174',
          'http://127.0.0.1:5173',
        ];
        if (process.env.CLIENT_URL) {
          allowedOrigins.push(process.env.CLIENT_URL);
        }
        if (!origin) return callback(null, true);
        if (process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Socket auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.user?.id})`);

    socket.join('seats'); // All clients join the seats room
    if (socket.user?.id) socket.join(`user:${socket.user.id}`); // private room for notifications

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

// Emit real-time seat update to all clients
const emitSeatUpdate = (data) => {
  if (io) {
    io.to('seats').emit('seat_update', data);
  }
};

// Send a private notification to one user (shown as a toast in the client)
const emitToUser = (userId, event, data) => {
  if (io && userId) io.to(`user:${userId}`).emit(event, data);
};

module.exports = { initSocket, getIO, emitSeatUpdate, emitToUser };
