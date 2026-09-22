// Socket events DURING a game. Thin handlers — the work happens in
// game.service.js and the game's own rules file.
// This file never mentions a specific game.

import * as gameService from '../services/game.service.js';
import * as roomService from '../services/room.service.js';
import { on, requireRoom, broadcastRoom, playerChannel } from './helpers.js';

// Starts the room's selected game and tells game.service how to reach
// the players (the service itself doesn't know about Socket.IO).
export function startGameForRoom(io, room) {
    const playerIds = room.players.map((player) => player.playerId);

    gameService.startGame(room.roomCode, room.selectedGame, playerIds, {
        onState: (playerId, state) => {
            io.to(playerChannel(playerId)).emit('game:state', state);
        },
        onEnd: async () => {
            try {
                const updatedRoom = await roomService.setStatus(room.roomCode, 'finished');
                if (updatedRoom) {
                    broadcastRoom(io, updatedRoom);
                }
            } catch (err) {
                console.error('[game] could not save game over:', err);
            }
        },
    });
}

export function registerGameHandlers(io, socket) {
    // The client only REQUESTS a move. The game rules decide if it's allowed.
    on(socket, 'game:action', async ({ action }) => {
        const { roomCode, playerId } = requireRoom(socket);
        const result = gameService.handleAction(roomCode, playerId, action);
        return { result };
    });

    on(socket, 'game:rematch', async () => {
        const { roomCode, playerId } = requireRoom(socket);
        const restarted = gameService.requestRematch(roomCode, playerId);

        const room = restarted
            ? await roomService.setStatus(roomCode, 'playing')
            : await roomService.getRoom(roomCode);
        broadcastRoom(io, room); // shows "wants a rematch" or the new game
        return {};
    });
}
