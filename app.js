import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();

// Use your exact frontend domain (remove trailing slash)
const FRONTEND_URL = "https://codesender.vercel.app";

app.use(cors({
  origin: [FRONTEND_URL, "http://localhost:3000", "http://localhost:5173"], // Add localhost for development
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Add a health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'CodeSender Backend is running', timestamp: new Date() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [FRONTEND_URL, "http://localhost:3000", "http://localhost:5173"],
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Add these options for better connection handling
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// In-memory room tracking
const rooms = {};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('joinRoom', ({ roomId, username }) => {
    console.log(`User ${username} joining room ${roomId}`);
    
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    
    // Check if user already exists in room to avoid duplicates
    const existingUser = rooms[roomId].find(u => u.id === socket.id);
    if (!existingUser) {
      rooms[roomId].push({ id: socket.id, username });
    }
    
    const userCount = rooms[roomId].length;
    console.log(`Room ${roomId} now has ${userCount} users`);
    
    // Emit to all users in the room (including sender) with updated user count
    io.to(roomId).emit('userJoined', { username, userCount });
    io.to(roomId).emit('userCountUpdate', { userCount });
    
    // Send current user count to the joining user
    socket.emit('roomInfo', { userCount, roomId });
  });

  socket.on('sendMessage', ({ roomId, message, code, language }) => {
    console.log(`Message sent to room ${roomId} by ${socket.id}`);
    
    const user = rooms[roomId]?.find(u => u.id === socket.id);
    const username = user?.username || 'Anonymous';
    
    console.log(`Broadcasting message from ${username} to room ${roomId}`);
    
    // Send to OTHER users in the room (excluding sender)
    socket.to(roomId).emit('receiveMessage', {
      username,
      message,
      code,
      language,
      timestamp: Date.now(),
      senderId: socket.id
    });
  });

  socket.on('leaveRoom', ({ roomId }) => {
    console.log(`User leaving room ${roomId}`);
    
    socket.leave(roomId);
    
    if (rooms[roomId]) {
      const user = rooms[roomId].find(u => u.id === socket.id);
      rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
      
      const userCount = rooms[roomId].length;
      
      if (user) {
        io.to(roomId).emit('userLeft', { 
          username: user.username, 
          userCount 
        });
        io.to(roomId).emit('userCountUpdate', { userCount });
      }
      
      // Clean up empty rooms
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted (empty)`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove user from all rooms and notify other users
    for (const roomId in rooms) {
      const user = rooms[roomId].find(u => u.id === socket.id);
      if (user) {
        rooms[roomId] = rooms[roomId].filter(u => u.id !== socket.id);
        const userCount = rooms[roomId].length;
        
        io.to(roomId).emit('userLeft', { 
          username: user.username, 
          userCount 
        });
        io.to(roomId).emit('userCountUpdate', { userCount });
        
        // Clean up empty rooms
        if (rooms[roomId].length === 0) {
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted (empty)`);
        }
      }
    }
  });

  // Add error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Add error handling for the server
server.on('error', (error) => {
  console.error('Server error:', error);
});

io.on('error', (error) => {
  console.error('Socket.IO error:', error);
});

// PORT env used for deployment
const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Server URL: http://localhost:${PORT}`);
});
