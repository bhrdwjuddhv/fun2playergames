// The Worker: the front door.
//
//   POST /api/rooms        → make a new room, answer with its code
//   GET  /api/rooms/:code  → does this room exist, and is there space?
//   GET  /ws?room=CODE     → hand the WebSocket to that room's Durable Object
//
// The website itself is deployed separately on Cloudflare Pages, so this
// Worker serves no pages. Because the site and this Worker are on different
// addresses, every answer needs CORS headers ("this website may talk to me").

import { GameRoom } from './room.do.js';
import * as roomService from './services/room.service.js';
import { generateRoomCode } from './utils/index.js';

// The Durable Object class must be exported from the Worker's main file.
export { GameRoom };

// Which website may use this Worker. CLIENT_ORIGIN is set in wrangler.jsonc
// (or in the dashboard). Empty = allow any website.
const isAllowedOrigin = (env, origin) => {
    const allowed = (env.CLIENT_ORIGIN ?? '').trim();
    if (!allowed) return true;
    return allowed
        .split(',')
        .map((value) => value.trim().replace(/\/$/, ''))
        .includes((origin ?? '').replace(/\/$/, ''));
};

const corsHeaders = (env, origin) => ({
    'Access-Control-Allow-Origin': (env.CLIENT_ORIGIN ?? '').trim() ? origin : '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
});

const json = (data, status, env, origin) =>
    Response.json(data, { status, headers: corsHeaders(env, origin) });

// Rooms are always changed through their own Durable Object, so there is
// only ever one writer per room.
const roomStub = (env, roomCode) => env.ROOM.getByName(roomCode);

async function createRoom(request, env, ctx, origin) {
    const { playerId, name } = await request.json().catch(() => ({}));

    // Old rooms are cleaned up in the background, after the answer is sent.
    ctx.waitUntil(roomService.deleteOldRooms(env.DB).catch(() => {}));

    // A random code could (very rarely) already exist → try a few times.
    for (let attempt = 0; attempt < 5; attempt++) {
        const roomCode = generateRoomCode();
        const created = await roomStub(env, roomCode).createRoom(roomCode, playerId, name);
        if (created) return json({ success: true, roomCode }, 200, env, origin);
    }
    return json({ success: false, message: 'Could not create a room, please try again' }, 503, env, origin);
}

async function getRoom(env, roomCode, origin) {
    const room = await roomService.getRoom(env.DB, roomCode);
    if (!room) return json({ success: false, message: 'Room not found' }, 404, env, origin);

    // Only a summary: the full room contains every player's id, and knowing
    // an id would let someone take that seat.
    return json(
        {
            success: true,
            room: { roomCode: room.roomCode, status: room.status, playerCount: room.players.length },
        },
        200,
        env,
        origin,
    );
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');

        if (!isAllowedOrigin(env, origin)) {
            return new Response('Not allowed', { status: 403 });
        }

        // The browser asks "may I?" before a POST with JSON.
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
        }

        try {
            if (url.pathname === '/ws') {
                const roomCode = (url.searchParams.get('room') ?? '').toUpperCase();
                if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
                    return new Response('Bad room code', { status: 400 });
                }
                // Same code = same Durable Object, wherever the players are.
                return roomStub(env, roomCode).fetch(request);
            }

            if (url.pathname === '/api/rooms' && request.method === 'POST') {
                return await createRoom(request, env, ctx, origin);
            }

            const match = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
            if (match && request.method === 'GET') {
                return await getRoom(env, decodeURIComponent(match[1]), origin);
            }

            // Anything else: this Worker only serves the API.
            return json({ success: false, message: 'Not found' }, 404, env, origin);
        } catch (err) {
            // A thrown ApiError carries its own status code (400/404/...).
            const status = err.statusCode ?? 500;
            if (status >= 500) console.error(err);
            return json(
                { success: false, message: status >= 500 ? 'Something went wrong' : err.message },
                status,
                env,
                origin,
            );
        }
    },
};
