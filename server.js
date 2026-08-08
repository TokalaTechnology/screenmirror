const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 9090;

// Serve the remote-ui directly
const remoteUiPath = path.join(__dirname, 'remote-ui');
app.use(express.static(remoteUiPath));

// Fallback health check
app.get('/status', (req, res) => {
  res.send('Prochame Relay Server is active!');
});

let agentSocket = null;

io.on('connection', (socket) => {
  console.log('[Relay] Client connected:', socket.id);

  // Register client role: 'agent' or 'driver'
  socket.on('register:role', (role) => {
    if (role === 'agent') {
      agentSocket = socket;
      console.log('[Relay] Agent (System A) connected:', socket.id);
      socket.join('agents');
    } else if (role === 'driver') {
      console.log('[Relay] Driver (System B) connected:', socket.id);
      socket.join('drivers');
      
      // Request full history from Agent to sync to new Driver
      if (agentSocket) {
        agentSocket.emit('request:chat-history', { to: socket.id });
      }
    }
  });

  // Relay screen frames: Agent -> Drivers
  socket.on('driver:screen-frame', (data) => {
    socket.to('drivers').emit('driver:screen-frame', data);
  });

  // Relay transcript turns: Agent -> Drivers
  socket.on('driver:transcript-turn', (data) => {
    socket.to('drivers').emit('driver:transcript-turn', data);
  });

  // Relay LLM events: Agent -> Drivers
  socket.on('driver:llm-start', (data) => {
    socket.to('drivers').emit('driver:llm-start', data);
  });

  socket.on('driver:llm-token', (data) => {
    socket.to('drivers').emit('driver:llm-token', data);
  });

  socket.on('driver:llm-done', (data) => {
    socket.to('drivers').emit('driver:llm-done', data);
  });

  socket.on('driver:llm-error', (data) => {
    socket.to('drivers').emit('driver:llm-error', data);
  });

  socket.on('driver:chat-history', (data) => {
    if (data && data.to) {
      io.to(data.to).emit('driver:chat-history', data.history);
    } else if (data) {
      socket.to('drivers').emit('driver:chat-history', data.history);
    }
  });

  socket.on('driver:chat-clear', (data) => {
    socket.to('drivers').emit('driver:chat-clear', data);
  });

  // Relay commands: Drivers -> Agent
  socket.on('driver:trigger-mode', (payload) => {
    socket.to('agents').emit('driver:trigger-mode', payload);
  });

  socket.on('disconnect', () => {
    if (agentSocket && agentSocket.id === socket.id) {
      agentSocket = null;
      console.log('[Relay] Agent (System A) disconnected');
    } else {
      console.log('[Relay] Client disconnected:', socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Relay] Server listening on port ${PORT}`);
});
