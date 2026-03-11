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

    return orderArray
        .filter(id => room.players[id])
        .map(id => room.players[id]);
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
