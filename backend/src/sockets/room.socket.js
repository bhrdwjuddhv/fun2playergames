// Socket events for rooms. Handlers stay THIN:
// read input → call room.service → join socket channel / broadcast the room.

import * as roomService from '../services/room.service.js';
import * as gameService from '../services/game.service.js';
import { on, requireRoom, broadcastRoom, playerChannel } from './helpers.js';
import { startGameForRoom } from './game.socket.js';

export function registerRoomHandlers(io, socket) {
    // Remember who this socket is (server-side), and subscribe it to the
    // player's private channel.
    const enterRoom = (room, playerId) => {
        socket.data.playerId = playerId;
        socket.data.roomCode = room.roomCode;
        socket.join(playerChannel(playerId));
    };

    // FIX: the old code imported { createRoom, joinRoom } but then called
    // roomService.createRoom → "roomService is not defined".
    // Now the whole service is imported as `roomService`.
    on(socket, 'room:create', async ({ playerId, name }) => {
        // socket.id comes from the SERVER, never from the client.
        const room = await roomService.createRoom(playerId, name, socket.id);
        enterRoom(room, playerId);
        broadcastRoom(io, room);
        return {};
    });

    // Also used to RECONNECT: after a refresh the page joins again with the
    // same playerId, and joinRoom just updates the socketId.
    on(socket, 'room:join', async ({ roomCode, playerId, name }) => {
        let room = await roomService.joinRoom(roomCode, playerId, name, socket.id);
        enterRoom(room, playerId);

        // If the server restarted during a game, the DB says "playing" but
        // the live game (kept in memory) is gone → go back to voting.
        const inGame = room.status === 'playing' || room.status === 'finished';
        if (inGame && !gameService.isRunning(room.roomCode)) {
            room = await roomService.backToVoting(room.roomCode);
        }

        broadcastRoom(io, room);
        gameService.sendStateTo(room.roomCode, playerId); // show the current board
        return {};
    });

    on(socket, 'room:leave', async () => {
        const { roomCode, playerId } = requireRoom(socket);

        gameService.stopGame(roomCode); // a 2-player game can't go on with 1 player
        const room = await roomService.leaveRoom(roomCode, playerId);

        socket.leave(playerChannel(playerId));
        socket.data.roomCode = null;

        if (room) {
            broadcastRoom(io, room); // tell the other player
        }
        return {};
    });

    on(socket, 'room:vote', async ({ gameId, mode }) => {
        const { roomCode, playerId } = requireRoom(socket);
        const { room, gameStarted } = await roomService.castVote(roomCode, playerId, gameId, mode);

        // Room first (so the client shows the game screen), then the game's
        // first state.
        broadcastRoom(io, room);
        if (gameStarted) {
            startGameForRoom(io, room);
        }
        return {};
    });

    // "Pick another game" — back to the voting screen for both players.
    on(socket, 'room:newGame', async () => {
        const { roomCode } = requireRoom(socket);
        gameService.stopGame(roomCode);
        const room = await roomService.backToVoting(roomCode);
        broadcastRoom(io, room);
        return {};
    });

    // Closing the tab / losing Wi-Fi. The player is NOT removed from the room,
    // so they can come back; the other player just sees them as offline.
    socket.on('disconnect', async () => {
        const { roomCode, playerId } = socket.data;
        if (!roomCode) return;
        try {
            const room = await roomService.markDisconnected(roomCode, playerId, socket.id);
            if (room) {
                broadcastRoom(io, room);
            }
        } catch (err) {
            console.error('[socket] disconnect failed:', err);
        }
    });
}
