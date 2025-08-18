import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();

// Use your exact frontend domain
const FRONTEND_URL = "https://code-sender-frontend.vercel.app";

app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// In-memory room tracking (You can keep same logic)
const rooms = {};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('joinRoom', ({ roomId, username }) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push({ id: socket.id, username });
    const userCount = rooms[roomId].length;
    io.to(roomId).emit('userJoined', { username, userCount });
  });

  socket.on('sendMessage', ({ roomId, message, code, language }) => {
    socket.to(roomId).emit('receiveMessage', {
      username: rooms[roomId]?.find(u => u.id === socket.id)?.username || 'Anonymous',
      message,
      code,
      language,
      timestamp: Date.now()
    });
  });

  socket.on('leaveRoom', ({ roomId }) => {
    socket.leave(roomId);
    if (rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
      io.to(roomId).emit('userLeft', { username: rooms[roomId]?.find(u => u.id === socket.id)?.username });
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
    }
    console.log('Client disconnected:', socket.id);
  });
});

// PORT env used for deployment
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
