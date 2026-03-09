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

app.get('/room/:gameType/:roomId', (req, res) => {
  const gameType = req.params.gameType;
  if (gameType === 'bingo') {
    res.sendFile(path.join(__dirname, 'public', 'games', 'bingo.html'));
  } else if (gameType === 'liar') {
    res.sendFile(path.join(__dirname, 'public', 'games', 'liar.html'));
  } else {
    res.status(404).send("존재하지 않는 게임입니다.");
  }
});

const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});