import { registerRoomHandlers } from './room.socket.js';
import { registerGameHandlers } from './game.socket.js';

export function registerSockets(io) {
    io.on('connection', (socket) => {
        registerRoomHandlers(io, socket);
        registerGameHandlers(io, socket);
    });
}
