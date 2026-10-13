const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
  pingInterval: 25000,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 9090;

// Serve the remote screen mirror UI
const remoteUiPath = path.join(__dirname, 'remote-ui');
app.use(express.static(remoteUiPath));

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    service: 'Prochame Screen Relay Server',
    agentConnected: agentSocket !== null
  });
});

let agentSocket = null;
let lastAgentFrame = null;

io.on('connection', (socket) => {
  console.log('[Relay] Client connected:', socket.id);

  // Register client role: 'agent' (Desktop app) or 'driver' (Viewer)
  socket.on('register:role', (role) => {
    if (role === 'agent') {
      agentSocket = socket;
      console.log('[Relay] Host Agent (System A) connected:', socket.id);
      socket.join('agents');
    } else if (role === 'driver') {
      console.log('[Relay] Viewer Driver (System B) connected:', socket.id);
      socket.join('drivers');
      if (lastAgentFrame) {
        socket.emit('driver:screen-frame', lastAgentFrame);
      }
    }
  });

  // Relay screen frames: Host Agent -> Viewer Drivers
  socket.on('driver:screen-frame', (data) => {
    lastAgentFrame = data;
    socket.to('drivers').emit('driver:screen-frame', data);
  });

  // Relay helper stream & notes: Viewer Driver (System B) -> Host Agent (System A)
  socket.on('helper:screen-frame', (data, ack) => {
    socket.to('agents').emit('helper:screen-frame', data);
    if (typeof ack === 'function') ack();
  });

  socket.on('helper:stream-status', (status) => {
    socket.to('agents').emit('helper:stream-status', status);
  });

  socket.on('helper:notes', (payload) => {
    socket.to('agents').emit('helper:notes', payload);
  });

  socket.on('disconnect', () => {
    if (agentSocket && agentSocket.id === socket.id) {
      agentSocket = null;
      console.log('[Relay] Host Agent (System A) disconnected');
    } else {
      console.log('[Relay] Client disconnected:', socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Relay] Screen Relay Server listening on port ${PORT}`);
});
