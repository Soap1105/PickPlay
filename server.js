const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
require('dotenv').config();

const themeRoutes = require('./routes/themeRoutes');
const socketManager = require('./sockets/socketManager');

const app = express();
const server = http.createServer(app);

// --- 👇 [수정] CORS 설정 추가 (연결 오류 방지) ---
const io = new Server(server, {
  cors: {
    origin: "*", // 모든 주소에서 접속 허용
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API 라우트 연결
app.use('/api/themes', themeRoutes);

// 소켓 로직 연결
socketManager(io);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'games', 'game.html'));
});

const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});