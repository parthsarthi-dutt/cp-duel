const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const cfService = require('./services/codeforces');
const MatchManager = require('./matchManager');
const auth = require('./auth');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Auth & user routes
app.use('/auth', auth.router);
app.use('/api/league', require('./league')(io));

const matchManager = new MatchManager(io);
const userSockets = new Map(); // userId -> socketId
app.use('/social', require('./social')(io, userSockets));

cfService.initCodeforces();

// --- HTTP Routes ---
app.post('/api/create-match', async (req, res) => {
  try {
    const { timeLimit, ratingMin, ratingMax, type } = req.body;
    const match = await matchManager.createMatch(null, timeLimit, ratingMin, ratingMax, type || 'CASUAL');
    res.json({ roomId: match.id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- WebSockets ---
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', async ({ roomId, userId }, callback) => {
    try {
      const room = await matchManager.joinMatch(roomId, userId, socket.id);
      socket.join(roomId);
      io.to(roomId).emit('roomUpdated', matchManager.sanitizeRoom(room));
      if (typeof callback === 'function') callback({ success: true, room: matchManager.sanitizeRoom(room) });
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
    }
  });

  socket.on('joinLeague', ({ leagueId }) => {
    socket.join(`league_${leagueId}`);
    console.log(`Socket ${socket.id} joined league room league_${leagueId}`);
  });

  socket.on('toggleReady', async ({ roomId, userId, isReady }) => {
      await matchManager.toggleReady(roomId, userId, isReady);
  });

  socket.on('forfeitMatch', async ({ roomId, userId }) => {
      await matchManager.forfeitMatch(roomId, userId);
  });

  socket.on('voteInvalidateMatch', async ({ roomId, userId }) => {
      await matchManager.voteInvalidate(roomId, userId);
  });

  socket.on('registerUser', ({ userId }) => {
    userSockets.set(userId, socket.id);
    socket.userId = userId;
    console.log(`User ${userId} registered with socket ${socket.id}`);
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      userSockets.delete(socket.userId);
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
