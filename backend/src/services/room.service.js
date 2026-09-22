// room.service.js
// All room DATABASE logic lives here. Socket handlers and the HTTP
// controller call these functions, so the rules exist in ONE place.
// No `req`/`res`, no `socket`/`io` here — only plain inputs.
// Each function returns the room, or throws an ApiError.

import Room from '../models/room.model.js';
import generateRoomCode from '../utils/generateCode.js';
import { ApiError } from '../utils/index.js';
import { getGame } from '../games/index.js';

const MAX_PLAYERS = 2;

const cleanString = (value, fieldName) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ApiError(400, `${fieldName} is required`);
    }
    return value.trim();
};

const cleanRoomCode = (roomCode) => cleanString(roomCode, 'Room code').toUpperCase();

// FIX (security):
// playerId is used inside a database path: `votes.<playerId>`.
// A "." or "$" in it would change the meaning of the update
// ("votes.a.b" = a nested field). So only allow the characters the
// frontend generates (letters, digits, _ and -).
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const cleanPlayerId = (playerId) => {
    if (typeof playerId !== 'string' || !PLAYER_ID_PATTERN.test(playerId)) {
        throw new ApiError(400, 'Invalid player ID');
    }
    return playerId;
};

// Names are optional and only for display.
const cleanName = (name) => {
    if (typeof name !== 'string' || name.trim() === '') {
        return 'Player';
    }
    return name.trim().slice(0, 16);
};

// socketId is NOT validated here on purpose: it must always come from
// `socket.id` on the server, never from the client.
const createRoom = async (playerId, name, socketId) => {
    const player = { playerId: cleanPlayerId(playerId), name: cleanName(name), socketId };

    const newRoom = () => Room.create({
        roomCode: generateRoomCode(),
        players: [player],
    });

    // roomCode is `unique`. In the very rare case that the random code
    // already exists, MongoDB throws error code 11000 → try one new code.
    try {
        return await newRoom();
    } catch (err) {
        if (err.code === 11000) {
            return await newRoom();
        }
        throw err;
    }
};

const joinRoom = async (roomCode, playerId, name, socketId) => {
    const cleanCode = cleanRoomCode(roomCode);
    const cleanId = cleanPlayerId(playerId);
    const cleanPlayerName = cleanName(name);

    // CASE 1: The player is already in this room (e.g. they refreshed the
    // page and got a NEW socket.id). This is not an error — just save the new
    // socketId. `players.$` means "the player that matched the filter".
    const rejoinedRoom = await Room.findOneAndUpdate(
        { roomCode: cleanCode, 'players.playerId': cleanId },
        { $set: { 'players.$.socketId': socketId, 'players.$.name': cleanPlayerName } },
        { returnDocument: 'after' } // return the room AFTER the update
    );
    if (rejoinedRoom) {
        return rejoinedRoom;
    }

    // CASE 2: A new player. The check ("is there a free spot?") and the push
    // happen in ONE database operation, so two people joining at the same
    // moment can't both get the last spot.
    // 'players.1': { $exists: false } means "there is no 2nd player yet".
    const joinedRoom = await Room.findOneAndUpdate(
        { roomCode: cleanCode, [`players.${MAX_PLAYERS - 1}`]: { $exists: false } },
        {
            $push: { players: { playerId: cleanId, name: cleanPlayerName, socketId } },
            // A room always has 1 player before this (the creator), so after
            // the push it has 2 → time to vote.
            $set: { status: 'voting' },
        },
        { returnDocument: 'after' }
    );
    if (joinedRoom) {
        return joinedRoom;
    }

    // Nothing matched: either the room doesn't exist, or it's full.
    const roomExists = await Room.exists({ roomCode: cleanCode });
    if (!roomExists) {
        throw new ApiError(404, 'Room not found');
    }
    throw new ApiError(400, 'Room is already full');
};

const getRoom = async (roomCode) => {
    const room = await Room.findOne({ roomCode: cleanRoomCode(roomCode) });
    if (!room) {
        throw new ApiError(404, 'Room not found');
    }
    return room;
};

// Removes the player. Returns the updated room, or null if the room was
// deleted because nobody is left.
const leaveRoom = async (roomCode, playerId) => {
    const room = await Room.findOneAndUpdate(
        { roomCode: cleanRoomCode(roomCode) },
        {
            $pull: { players: { playerId: cleanPlayerId(playerId) } },
            // The remaining player waits for a new opponent.
            $set: { status: 'waiting', selectedGame: null, selectedMode: null, votes: {} },
        },
        { returnDocument: 'after' }
    );
    if (!room) {
        throw new ApiError(404, 'Room not found');
    }

    if (room.players.length === 0) {
        await Room.deleteOne({ _id: room._id });
        return null;
    }
    return room;
};

// Called when a socket disconnects (closed tab, lost Wi-Fi...).
// The player stays in the room so they can come back; we only clear their
// socketId. The filter also checks the socketId: if the player already
// reconnected with a NEW socket, the old socket's disconnect must not
// mark them as offline.
const markDisconnected = async (roomCode, playerId, socketId) => {
    return Room.findOneAndUpdate(
        { roomCode, players: { $elemMatch: { playerId, socketId } } },
        { $set: { 'players.$.socketId': null } },
        { returnDocument: 'after' }
    );
};

// A vote is saved as one string: "gameId" or "gameId:mode".
const splitVote = (vote) => {
    const [gameId, mode = null] = vote.split(':');
    return { gameId, mode };
};

// Saves one vote. When both players have voted, picks the game.
// Returns { room, gameStarted }.
const castVote = async (roomCode, playerId, gameId, mode) => {
    const cleanId = cleanPlayerId(playerId);

    // Never trust the client: only accept games (and modes) that really exist.
    const game = typeof gameId === 'string' ? getGame(gameId) : null;
    if (!game) {
        throw new ApiError(400, 'Unknown game');
    }
    let vote = gameId;
    if (game.modes) {
        // No mode chosen → the game's first (default) mode.
        const chosenMode = mode ?? game.modes[0].id;
        if (!game.modes.some((option) => option.id === chosenMode)) {
            throw new ApiError(400, 'Unknown game mode');
        }
        vote = `${gameId}:${chosenMode}`;
    }

    const room = await Room.findOneAndUpdate(
        { roomCode, status: 'voting', 'players.playerId': cleanId },
        { $set: { [`votes.${cleanId}`]: vote } },
        { returnDocument: 'after' }
    );
    if (!room) {
        throw new ApiError(400, "You can't vote right now");
    }

    const votes = room.players.map((player) => room.votes.get(player.playerId));
    const everyoneVoted = room.players.length === MAX_PLAYERS && votes.every(Boolean);
    if (!everyoneVoted) {
        return { room, gameStarted: false };
    }

    // Same vote → that game. Different votes → pick one of them randomly.
    const chosen = splitVote(votes[Math.floor(Math.random() * votes.length)]);

    // The filter `status: 'voting'` makes sure only ONE request starts the
    // game, even if both votes arrive at the same moment.
    const startedRoom = await Room.findOneAndUpdate(
        { _id: room._id, status: 'voting' },
        { $set: { status: 'playing', selectedGame: chosen.gameId, selectedMode: chosen.mode } },
        { returnDocument: 'after' }
    );
    if (!startedRoom) {
        return { room, gameStarted: false };
    }
    return { room: startedRoom, gameStarted: true };
};

const setStatus = async (roomCode, status) => {
    return Room.findOneAndUpdate(
        { roomCode },
        { $set: { status } },
        { returnDocument: 'after' }
    );
};

// After a game: go back to picking a game (or waiting, if alone).
const backToVoting = async (roomCode) => {
    const room = await getRoom(roomCode);
    room.status = room.players.length === MAX_PLAYERS ? 'voting' : 'waiting';
    room.selectedGame = null;
    room.selectedMode = null;
    room.votes = new Map();
    await room.save();
    return room;
};

export {
    splitVote,
    createRoom,
    joinRoom,
    getRoom,
    leaveRoom,
    markDisconnected,
    castVote,
    setStatus,
    backToVoting,
};
