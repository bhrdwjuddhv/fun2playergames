// The Worker: the front door.
//
//   POST /api/rooms        → make a new room, answer with its code
//   GET  /api/rooms/:code  → does this room exist, and is there space?
//   GET  /ws?room=CODE     → hand the WebSocket to that room's Durable Object
//   everything else        → the built React app (frontend/dist)

import { GameRoom } from './room.do.js';
import * as roomService from './services/room.service.js';
import { generateRoomCode } from './utils/index.js';

// The Durable Object class must be exported from the Worker's main file.
export { GameRoom };

const json = (data, status = 200) => Response.json(data, { status });

// Rooms are always changed through their own Durable Object, so there is
// only ever one writer per room.
const roomStub = (env, roomCode) => env.ROOM.getByName(roomCode);

async function createRoom(request, env, ctx) {
    const { playerId, name } = await request.json().catch(() => ({}));

    // Old rooms are cleaned up in the background, after the answer is sent.
    ctx.waitUntil(roomService.deleteOldRooms(env.DB).catch(() => {}));

    // A random code could (very rarely) already exist → try a few times.
    for (let attempt = 0; attempt < 5; attempt++) {
        const roomCode = generateRoomCode();
        const created = await roomStub(env, roomCode).createRoom(roomCode, playerId, name);
        if (created) return json({ success: true, roomCode });
    }
    return json({ success: false, message: 'Could not create a room, please try again' }, 503);
}

async function getRoom(env, roomCode) {
    const room = await roomService.getRoom(env.DB, roomCode);
    if (!room) return json({ success: false, message: 'Room not found' }, 404);

    // Only a summary: the full room contains every player's id, and knowing
    // an id would let someone take that seat.
    return json({
        success: true,
        room: { roomCode: room.roomCode, status: room.status, playerCount: room.players.length },
    });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        try {
            if (url.pathname === '/ws') {
                const roomCode = (url.searchParams.get('room') ?? '').toUpperCase();
                if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
                    return new Response('Bad room code', { status: 400 });
                }
                // Same code = same Durable Object, wherever the player is.
                return roomStub(env, roomCode).fetch(request);
            }

            if (url.pathname === '/api/rooms' && request.method === 'POST') {
                return await createRoom(request, env, ctx);
            }

            const match = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
            if (match && request.method === 'GET') {
                return await getRoom(env, decodeURIComponent(match[1]));
            }

            if (url.pathname.startsWith('/api/')) {
                return json({ success: false, message: 'Not found' }, 404);
            }

            // Anything else is the website itself.
            return env.ASSETS.fetch(request);
        } catch (err) {
            // A thrown ApiError carries its own status code (400/404/...).
            const status = err.statusCode ?? 500;
            if (status >= 500) console.error(err);
            return json({ success: false, message: status >= 500 ? 'Something went wrong' : err.message }, status);
        }
    },
};
