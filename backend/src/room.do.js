// GameRoom — a Durable Object. There is exactly ONE of these per room code,
// anywhere in the world, and it handles one message at a time.
//
// It replaces the old Socket.IO server:
//   - it holds the players' WebSocket connections
//   - it runs the live game (game.service.js)
//   - it reads and writes the room in D1 (room.service.js)
//
// WHY NOT WebSocket "hibernation"?
// Hibernation lets a Durable Object sleep while connections stay open, and
// Cloudflare recommends it for idle sockets like chat. Our games run timers
// (a 30-second drawing round, a race that ticks 20 times a second), and a
// sleeping object cannot run timers. So we accept the sockets normally,
// which keeps this object awake while people are playing.

import { DurableObject } from 'cloudflare:workers';
import * as roomService from './services/room.service.js';
import { createGameEngine } from './services/game.service.js';
import { gameList } from './games/index.js';
import { ApiError } from './utils/index.js';

export class GameRoom extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.db = env.DB;
        this.roomCode = null;                 // set on the first connection
        this.socketsByPlayer = new Map();     // playerId → Set of WebSockets
        this.playerBySocket = new Map();      // WebSocket → playerId

        this.engine = createGameEngine({
            env,
            onState: (playerId, state) => this.sendTo(playerId, 'game:state', state),
            onEnd: () => {
                // Save "finished" and tell both screens. This runs on its own
                // (a timer ended the game), so errors are only logged.
                this.ctx.waitUntil(
                    (async () => {
                        try {
                            const room = await roomService.setStatus(this.db, this.roomCode, 'finished');
                            this.broadcastRoom(room);
                        } catch (err) {
                            console.error('could not save game over:', err);
                        }
                    })(),
                );
            },
        });
    }

    // Called by the Worker when someone creates a room with this code.
    async createRoom(roomCode, playerId, name) {
        this.roomCode = roomCode;
        return roomService.createRoom(this.db, roomCode, playerId, name);
    }

    // A browser connecting: GET /ws?room=CODE
    async fetch(request) {
        const url = new URL(request.url);
        this.roomCode = url.searchParams.get('room');

        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected a WebSocket', { status: 426 });
        }

        const [client, server] = Object.values(new WebSocketPair());
        server.accept();
        server.addEventListener('message', (event) => this.ctx.waitUntil(this.onMessage(server, event.data)));
        server.addEventListener('close', () => this.ctx.waitUntil(this.onClose(server)));
        server.addEventListener('error', () => this.ctx.waitUntil(this.onClose(server)));

        return new Response(null, { status: 101, webSocket: client });
    }

    // ——— sending ———

    send(socket, message) {
        try {
            socket.send(JSON.stringify(message));
        } catch {
            // the socket just closed; the close handler tidies up
        }
    }

    // To every connection of one player (they may have two tabs open).
    sendTo(playerId, event, data) {
        for (const socket of this.socketsByPlayer.get(playerId) ?? []) {
            this.send(socket, { event, data });
        }
    }

    // What a CLIENT may see about a room. playerIds are NOT included:
    // knowing someone's id would let you take their seat.
    publicRoom(room, forPlayerId) {
        const meta = this.engine.getMeta();
        return {
            roomCode: room.roomCode,
            status: room.status,
            selectedGame: room.selectedGame,
            selectedMode: room.selectedMode,
            mySeat: room.players.findIndex((player) => player.playerId === forPlayerId),
            players: room.players.map((player) => ({
                seat: player.seat,
                name: player.name,
                connected: player.connected,
            })),
            votes: room.players.map((player) => roomService.splitVote(player.vote)),
            games: gameList,
            result: meta.result,
            rematchSeats: meta.rematchSeats,
        };
    }

    broadcastRoom(room) {
        if (!room) return;
        for (const player of room.players) {
            this.sendTo(player.playerId, 'room:update', this.publicRoom(room, player.playerId));
        }
    }

    // ——— receiving ———
    //
    // Every message is { id, event, payload }. We answer with
    // { ack: id, ok: true/false, ... }, which is how the browser knows
    // whether its move was accepted.
    async onMessage(socket, raw) {
        let message;
        try {
            message = JSON.parse(raw);
        } catch {
            return; // not JSON — ignore
        }
        const { id, event, payload = {} } = message ?? {};

        try {
            const data = await this.handleEvent(socket, event, payload ?? {});
            if (id) this.send(socket, { ack: id, ok: true, ...data });
        } catch (err) {
            if (err instanceof ApiError) {
                if (id) this.send(socket, { ack: id, ok: false, message: err.message });
            } else {
                console.error(`"${event}" failed:`, err);
                if (id) this.send(socket, { ack: id, ok: false, message: 'Something went wrong' });
            }
        }
    }

    // The player this socket belongs to. Set when they join, and used for
    // every later message — a client cannot claim to be someone else.
    playerOf(socket) {
        const playerId = this.playerBySocket.get(socket);
        if (!playerId) throw new ApiError(400, 'Join a room first');
        return playerId;
    }

    async handleEvent(socket, event, payload) {
        switch (event) {
            case 'room:join':
                return this.onJoin(socket, payload);

            case 'room:leave': {
                const playerId = this.playerOf(socket);
                this.engine.stop(); // a 2-player game can't go on with one player
                const room = await roomService.leaveRoom(this.db, this.roomCode, playerId);
                this.forget(socket);
                this.broadcastRoom(room);
                return {};
            }

            case 'room:vote': {
                const playerId = this.playerOf(socket);
                const { room, gameStarted } = await roomService.castVote(
                    this.db,
                    this.roomCode,
                    playerId,
                    payload.gameId,
                    payload.mode,
                );
                // Room first (so the screen switches), then the first game state.
                this.broadcastRoom(room);
                if (gameStarted) {
                    this.engine.start(
                        room.selectedGame,
                        room.selectedMode,
                        room.players.map((player) => player.playerId),
                    );
                }
                return {};
            }

            case 'room:newGame': {
                this.playerOf(socket);
                this.engine.stop();
                this.broadcastRoom(await roomService.backToVoting(this.db, this.roomCode));
                return {};
            }

            case 'game:action': {
                const playerId = this.playerOf(socket);
                // The client only REQUESTS a move; the game rules decide.
                const result = await this.engine.handleAction(playerId, payload.action);
                return { result };
            }

            case 'game:rematch': {
                const playerId = this.playerOf(socket);
                const restarted = this.engine.requestRematch(playerId);
                const room = restarted
                    ? await roomService.setStatus(this.db, this.roomCode, 'playing')
                    : await roomService.getRoom(this.db, this.roomCode);
                this.broadcastRoom(room);
                return {};
            }

            default:
                throw new ApiError(400, 'Unknown event');
        }
    }

    // Joining is also RECONNECTING: after a refresh the browser has a new
    // connection but the same playerId, and simply takes its seat back.
    async onJoin(socket, payload) {
        let room = await roomService.joinRoom(this.db, this.roomCode, payload.playerId, payload.name);
        const playerId = room.players.find((player) => player.playerId === payload.playerId).playerId;

        this.playerBySocket.set(socket, playerId);
        if (!this.socketsByPlayer.has(playerId)) this.socketsByPlayer.set(playerId, new Set());
        this.socketsByPlayer.get(playerId).add(socket);

        // If this object restarted (a deploy, or everyone was away), the
        // database can still say "playing" while no game is running.
        const inGame = room.status === 'playing' || room.status === 'finished';
        if (inGame && !this.engine.isRunning()) {
            room = await roomService.backToVoting(this.db, this.roomCode);
        }

        this.broadcastRoom(room);
        this.engine.sendStateTo(playerId); // show the current board
        return {};
    }

    forget(socket) {
        const playerId = this.playerBySocket.get(socket);
        this.playerBySocket.delete(socket);
        const sockets = this.socketsByPlayer.get(playerId);
        sockets?.delete(socket);
        if (sockets && sockets.size === 0) this.socketsByPlayer.delete(playerId);
        return playerId;
    }

    // Closed tab / lost Wi-Fi. The player keeps their seat; the other player
    // just sees them as offline.
    async onClose(socket) {
        const playerId = this.forget(socket);
        if (!playerId || this.socketsByPlayer.has(playerId)) return; // another tab is still open
        try {
            const room = await roomService.setConnected(this.db, this.roomCode, playerId, false);
            this.broadcastRoom(room);
        } catch (err) {
            console.error('disconnect failed:', err);
        }
    }
}
