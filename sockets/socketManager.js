const commonSocket = require('./commonSocket');
const bingoSocket = require('./bingoSocket');
const liarSocket = require('./liarSocket');
const bombSocket = require('./bombSocket');

// 메모리에 유지되는 전역 게임 방 저장소
const gameRooms = {};

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('Socket Connected:', socket.id);

        // 범용 소켓 이벤트 (방 입장, 채팅, 나가기 등)
        commonSocket(io, socket, gameRooms);

        // 빙고 전용 소켓 이벤트
        bingoSocket(io, socket, gameRooms);

        // 라이어 전용 소켓 이벤트
        liarSocket(io, socket, gameRooms);

        // 폭탄돌리기 전용 소켓 이벤트
        bombSocket(io, socket, gameRooms);
    });
};
