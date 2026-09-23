// room.service.js
// All room DATABASE logic (D1 / SQL). Called from the room's Durable Object
// and from the Worker. No WebSockets and no game rules here.
//
// WHY THERE ARE NO "TWO PEOPLE AT ONCE" PROBLEMS ANY MORE:
// Every change to a room goes through that room's Durable Object, and a
// Durable Object handles one thing at a time. So a room can never be
// changed by two requests at the same moment.

import { ApiError } from '../utils/index.js';
import { getGame } from '../games/index.js';

const MAX_PLAYERS = 2;
const ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000; // old rooms are deleted after a day

const cleanString = (value, fieldName) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ApiError(400, `${fieldName} is required`);
    }
    return value.trim();
};

// Room codes are stored in UPPERCASE, so "ab12cd" must become "AB12CD".
const cleanRoomCode = (roomCode) => cleanString(roomCode, 'Room code').toUpperCase();

// Only allow the characters the frontend generates. Values from a client
// are never trusted; every query below also uses ? placeholders, so a value
// can never be read as SQL.
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const cleanPlayerId = (playerId) => {
    if (typeof playerId !== 'string' || !PLAYER_ID_PATTERN.test(playerId)) {
        throw new ApiError(400, 'Invalid player ID');
    }
    return playerId;
};

const cleanName = (name) => {
    if (typeof name !== 'string' || name.trim() === '') return 'Player';
    return name.trim().slice(0, 16);
};

// A vote is stored as one string: "gameId" or "gameId:mode".
export const splitVote = (vote) => {
    if (!vote) return null;
    const [gameId, mode = null] = vote.split(':');
    return { gameId, mode };
};

// Reads the room plus its players, and turns the SQL rows (snake_case) into
// one object the rest of the code can use (camelCase).
export const getRoom = async (db, roomCode) => {
    const code = cleanRoomCode(roomCode);
    const row = await db.prepare('SELECT * FROM rooms WHERE room_code = ?').bind(code).first();
    if (!row) return null;

    const { results } = await db
        .prepare('SELECT * FROM players WHERE room_code = ? ORDER BY seat')
        .bind(code)
        .all();

    return {
        roomCode: row.room_code,
        status: row.status,
        selectedGame: row.selected_game,
        selectedMode: row.selected_mode,
        players: results.map((player) => ({
            seat: player.seat,
            playerId: player.player_id,
            name: player.name,
            connected: player.connected === 1,
            vote: player.vote,
        })),
    };
};

const requireRoom = async (db, roomCode) => {
    const room = await getRoom(db, roomCode);
    if (!room) throw new ApiError(404, 'Room not found');
    return room;
};

const touch = (db, roomCode) =>
    db.prepare('UPDATE rooms SET updated_at = ? WHERE room_code = ?').bind(Date.now(), roomCode);

// Creates the room with its first player. Returns false if the code is
// already taken (the Worker then tries another code).
export const createRoom = async (db, roomCode, playerId, name) => {
    const code = cleanRoomCode(roomCode);
    const id = cleanPlayerId(playerId);
    const now = Date.now();

    const existing = await db.prepare('SELECT 1 FROM rooms WHERE room_code = ?').bind(code).first();
    if (existing) return false;

    // batch() runs both statements as one transaction: either the room AND
    // the player are saved, or neither is.
    await db.batch([
        db
            .prepare('INSERT INTO rooms (room_code, status, created_at, updated_at) VALUES (?, ?, ?, ?)')
            .bind(code, 'waiting', now, now),
        db
            .prepare('INSERT INTO players (room_code, seat, player_id, name, connected, joined_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(code, 0, id, cleanName(name), 0, now),
    ]);
    return true;
};

// Also used to RECONNECT: the same playerId simply comes back to their seat.
export const joinRoom = async (db, roomCode, playerId, name) => {
    const code = cleanRoomCode(roomCode);
    const id = cleanPlayerId(playerId);
    const playerName = cleanName(name);
    const room = await requireRoom(db, code);

    const existing = room.players.find((player) => player.playerId === id);
    if (existing) {
        await db.batch([
            db
                .prepare('UPDATE players SET name = ?, connected = 1 WHERE room_code = ? AND player_id = ?')
                .bind(playerName, code, id),
            touch(db, code),
        ]);
        return getRoom(db, code);
    }

    if (room.players.length >= MAX_PLAYERS) {
        throw new ApiError(400, 'Room is already full');
    }

    // Take the first free seat (0 or 1) — the other player keeps theirs.
    const seat = [0, 1].find((free) => !room.players.some((player) => player.seat === free));
    const full = room.players.length + 1 === MAX_PLAYERS;

    await db.batch([
        db
            .prepare('INSERT INTO players (room_code, seat, player_id, name, connected, joined_at) VALUES (?, ?, ?, ?, 1, ?)')
            .bind(code, seat, id, playerName, Date.now()),
        db
            .prepare('UPDATE rooms SET status = ?, updated_at = ? WHERE room_code = ?')
            .bind(full ? 'voting' : 'waiting', Date.now(), code),
    ]);
    return getRoom(db, code);
};

// Removes the player. Returns the updated room, or null if the room was
// deleted because nobody is left.
export const leaveRoom = async (db, roomCode, playerId) => {
    const code = cleanRoomCode(roomCode);
    const id = cleanPlayerId(playerId);

    await db.prepare('DELETE FROM players WHERE room_code = ? AND player_id = ?').bind(code, id).run();

    const room = await getRoom(db, code);
    if (!room) return null;

    if (room.players.length === 0) {
        await db.prepare('DELETE FROM rooms WHERE room_code = ?').bind(code).run();
        return null;
    }


    // The player left behind waits for a new opponent.
    await db.batch([
        db
            .prepare("UPDATE rooms SET status = 'waiting', selected_game = NULL, selected_mode = NULL, updated_at = ? WHERE room_code = ?")
            .bind(Date.now(), code),
        db.prepare('UPDATE players SET vote = NULL WHERE room_code = ?').bind(code),
    ]);
    return getRoom(db, code);
};

// Closed tab / lost Wi-Fi. The player keeps their seat so they can come back.
export const setConnected = async (db, roomCode, playerId, connected) => {
    await db
        .prepare('UPDATE players SET connected = ? WHERE room_code = ? AND player_id = ?')
        .bind(connected ? 1 : 0, cleanRoomCode(roomCode), cleanPlayerId(playerId))
        .run();
    return getRoom(db, roomCode);
};

// Saves one vote. When both players have voted, picks the game.
// Returns { room, gameStarted }.
export const castVote = async (db, roomCode, playerId, gameId, mode) => {
    const code = cleanRoomCode(roomCode);
    const id = cleanPlayerId(playerId);
    const room = await requireRoom(db, code);

    if (room.status !== 'voting' || !room.players.some((player) => player.playerId === id)) {
        throw new ApiError(400, "You can't vote right now");
    }

    // Never trust the client: only accept games (and modes) that exist.
    const game = typeof gameId === 'string' ? getGame(gameId) : null;
    if (!game) throw new ApiError(400, 'Unknown game');

    let vote = gameId;
    if (game.modes) {
        const chosenMode = mode ?? game.modes[0].id; // no mode chosen → the default
        if (!game.modes.some((option) => option.id === chosenMode)) {
            throw new ApiError(400, 'Unknown game mode');
        }
        vote = `${gameId}:${chosenMode}`;
    }

    await db
        .prepare('UPDATE players SET vote = ? WHERE room_code = ? AND player_id = ?')
        .bind(vote, code, id)
        .run();

    const updated = await getRoom(db, code);
    const votes = updated.players.map((player) => player.vote);
    const everyoneVoted = updated.players.length === MAX_PLAYERS && votes.every(Boolean);
    if (!everyoneVoted) {
        return { room: updated, gameStarted: false };
    }

    // Same vote → that game. Different votes → pick one of them at random.
    const chosen = splitVote(votes[Math.floor(Math.random() * votes.length)]);
    await db
        .prepare("UPDATE rooms SET status = 'playing', selected_game = ?, selected_mode = ?, updated_at = ? WHERE room_code = ?")
        .bind(chosen.gameId, chosen.mode, Date.now(), code)
        .run();

    return { room: await getRoom(db, code), gameStarted: true };
};

export const setStatus = async (db, roomCode, status) => {
    await db
        .prepare('UPDATE rooms SET status = ?, updated_at = ? WHERE room_code = ?')
        .bind(status, Date.now(), cleanRoomCode(roomCode))
        .run();
    return getRoom(db, roomCode);
};

// After a game: back to picking a game (or waiting, if alone).
export const backToVoting = async (db, roomCode) => {
    const code = cleanRoomCode(roomCode);
    const room = await requireRoom(db, code);
    const status = room.players.length === MAX_PLAYERS ? 'voting' : 'waiting';

    await db.batch([
        db
            .prepare('UPDATE rooms SET status = ?, selected_game = NULL, selected_mode = NULL, updated_at = ? WHERE room_code = ?')
            .bind(status, Date.now(), code),
        db.prepare('UPDATE players SET vote = NULL WHERE room_code = ?').bind(code),
    ]);
    return getRoom(db, code);
};

// Rooms nobody has touched for a day are deleted. (MongoDB did this by
// itself with a TTL index; in SQL we run the clean-up ourselves.)
export const deleteOldRooms = (db) => {
    const cutoff = Date.now() - ROOM_MAX_AGE_MS;
    return db.batch([
        db
            .prepare('DELETE FROM players WHERE room_code IN (SELECT room_code FROM rooms WHERE updated_at < ?)')
            .bind(cutoff),
        db.prepare('DELETE FROM rooms WHERE updated_at < ?').bind(cutoff),
    ]);
};
