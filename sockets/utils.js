const AVATARS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function sortTurnOrder(room) {
    let order = [...room.joinOrder].filter(id => room.players[id]);
    switch (room.turnOrderOption) {
        case 'random': return shuffleArray(order);
        case 'join_desc': return order.reverse();
        case 'join_asc': return order;
        case 'host_first': default:
            order = order.filter(id => id !== room.hostId);
            order.unshift(room.hostId);
            return order;
    }
}

function getSortedUserList(room) {
    const orderArray = (room.status === 'PLAYING' && room.turnOrder.length > 0)
        ? room.turnOrder
        : room.joinOrder;

    const list = orderArray
        .filter(id => room.players[id])
        .map(id => {
            const p = { ...room.players[id] };
            delete p.disconnectTimeout;
            return p;
        });

    // [Bug Fix] 방장을 항상 index 0으로 보장 (크라운 표시 위치 오류 방지)
    const hostIdx = list.findIndex(p => p.id === room.hostId);
    if (hostIdx > 0) {
        const [host] = list.splice(hostIdx, 1);
        list.unshift(host);
    }
    return list;
}

function updateReadyStatus(io, room, roomId) {
    const playerList = Object.values(room.players);
    const totalCount = playerList.length;
    const readyCount = playerList.filter(p => p.ready).length;
    io.to(roomId).emit('update ready status', { ready: readyCount, total: totalCount });
}

module.exports = {
    AVATARS,
    shuffleArray,
    sortTurnOrder,
    getSortedUserList,
    updateReadyStatus
};
