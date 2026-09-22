// Small helpers shared by room.socket.js and game.socket.js.

import { ApiError } from '../utils/index.js';
import { gameList } from '../games/index.js';
import * as gameService from '../services/game.service.js';

// Every socket of a player joins this channel, so the server can send
// messages to ONE player (e.g. their secret WeDraw word) instead of the
// whole room. It's a server-side name only; clients never see it.
export const playerChannel = (playerId) => `player:${playerId}`;

// Wraps a socket event handler so that:
//   - a missing payload or callback can't crash the server
//   - errors are sent back to the client as { ok: false, message }
//   - success is sent back as { ok: true, ...whatever the handler returned }
export const on = (socket, eventName, handler) => {
    socket.on(eventName, async (payload, callback) => {
        const reply = typeof callback === 'function' ? callback : () => {};
        try {
            const data = await handler(payload ?? {});
            reply({ ok: true, ...data });
        } catch (err) {
            if (err instanceof ApiError) {
                reply({ ok: false, message: err.message });
            } else {
                console.error(`[socket] "${eventName}" failed:`, err);
                reply({ ok: false, message: 'Something went wrong' });
            }
        }
    });
};

// socket.data is set by the SERVER when the player creates/joins a room.
// Using it (instead of a roomCode/playerId sent with every event) means a
// client can't pretend to be someone else or act in another room.
export const requireRoom = (socket) => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) {
        throw new ApiError(400, 'Join a room first');
    }
    return { roomCode, playerId };
};

// FIX (security): what the CLIENT is allowed to see about a room.
// playerIds are NOT included: knowing someone's playerId would let you
// rejoin as them. Players are identified by seat (0 or 1) instead.
const publicRoom = (room, forPlayerId) => {
    const meta = gameService.getMeta(room.roomCode);
    return {
        roomCode: room.roomCode,
        status: room.status,
        selectedGame: room.selectedGame,
        mySeat: room.players.findIndex((player) => player.playerId === forPlayerId),
        players: room.players.map((player, seat) => ({
            seat,
            name: player.name,
            connected: Boolean(player.socketId),
        })),
        votes: room.players.map((player) => room.votes.get(player.playerId) ?? null),
        games: gameList,
        result: meta.result,
        rematchSeats: meta.rematchSeats,
    };
};

// Sends the room to every player (each gets their own `mySeat`).
export const broadcastRoom = (io, room) => {
    for (const player of room.players) {
        io.to(playerChannel(player.playerId)).emit('room:update', publicRoom(room, player.playerId));
    }
};
