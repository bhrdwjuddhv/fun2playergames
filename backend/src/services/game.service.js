// game.service.js — the GENERIC game engine.
//
// It sits between the sockets and a specific game's rules
// (games/<name>/game.js). No tic-tac-toe or race rules in this file.
//
// Live games are kept in memory (a Map), not in MongoDB: the race changes
// 20 times a second, which is far too often for a database.
// ponytail: in-memory only — a server restart ends running games (rooms
// survive in MongoDB). Move to a shared store only if you run 2+ servers.
//
// HOW PLAYERS ARE IDENTIFIED:
// Games never see playerIds. They only see "seats": 0 and 1.
// This service converts playerId → seat. That keeps games simple, and it
// means game state sent to clients never contains anyone's playerId.

import { getGame } from '../games/index.js';
import { ApiError } from '../utils/index.js';

// What one player receives: the game's own state + generic info.
// `match` changes on every rematch, so the frontend knows to reset its screen.
const stateFor = (entry, seat) => ({
    ...entry.game.getState(seat),
    result: entry.result,
    match: entry.matchNumber,
});

// roomCode → { gameId, playerIds, game, callbacks, result, rematchSeats, matchNumber }
const activeGames = new Map();

// callbacks.onState(playerId, state) — send a state to one player
// callbacks.onEnd(result)            — the game just finished
const startGame = (roomCode, gameId, playerIds, callbacks, matchNumber = 0) => {
    const gameModule = getGame(gameId);
    if (!gameModule) {
        throw new ApiError(400, 'Unknown game');
    }

    stopGame(roomCode); // never run two games in the same room

    const entry = {
        gameId,
        playerIds,
        callbacks,
        matchNumber,
        game: null,
        result: null,
        rematchSeats: new Set(),
    };

    // Each player gets their OWN view of the game (getState(seat)).
    // WeDraw needs this: you may see your word, but not your opponent's.
    const sendState = () => {
        if (!entry.game) return; // still inside create()
        playerIds.forEach((playerId, seat) => {
            callbacks.onState(playerId, stateFor(entry, seat));
        });
    };

    // This object is everything a game is allowed to do to the outside world.
    const api = {
        update: sendState,
        end: (result) => {
            if (entry.result) return; // already over
            entry.result = result; // { winnerSeat: 0 | 1 | null (draw), scores?: [...] }
            entry.game.stop();
            sendState();
            callbacks.onEnd(result);
        },
    };

    activeGames.set(roomCode, entry);
    entry.game = gameModule.create(api, { matchNumber });
    sendState();
};

const handleAction = (roomCode, playerId, action) => {
    const entry = activeGames.get(roomCode);
    if (!entry) {
        throw new ApiError(400, 'No game is running');
    }
    if (entry.result) {
        throw new ApiError(400, 'The game is over');
    }

    const seat = entry.playerIds.indexOf(playerId);
    if (seat === -1) {
        throw new ApiError(403, 'You are not playing in this game');
    }
    if (typeof action !== 'object' || action === null) {
        throw new ApiError(400, 'Invalid action');
    }

    // Games throw a normal Error for invalid moves ("Not your turn").
    // We turn it into an ApiError (400) so the message reaches the player.
    try {
        return entry.game.handleAction(seat, action);
    } catch (err) {
        throw new ApiError(400, err.message);
    }
};

// Both players must ask for a rematch. Returns true when a new game started.
const requestRematch = (roomCode, playerId) => {
    const entry = activeGames.get(roomCode);
    if (!entry || !entry.result) {
        throw new ApiError(400, 'There is no finished game to rematch');
    }

    const seat = entry.playerIds.indexOf(playerId);
    if (seat === -1) {
        throw new ApiError(403, 'You are not playing in this game');
    }

    entry.rematchSeats.add(seat);
    if (entry.rematchSeats.size < entry.playerIds.length) {
        return false;
    }

    startGame(roomCode, entry.gameId, entry.playerIds, entry.callbacks, entry.matchNumber + 1);
    return true;
};

// Extra info the room screen needs (result + who wants a rematch).
const getMeta = (roomCode) => {
    const entry = activeGames.get(roomCode);
    if (!entry) {
        return { result: null, rematchSeats: [] };
    }
    return { result: entry.result, rematchSeats: [...entry.rematchSeats] };
};

const isRunning = (roomCode) => activeGames.has(roomCode);

// Used when a player (re)joins mid-game, so they see the current board.
const sendStateTo = (roomCode, playerId) => {
    const entry = activeGames.get(roomCode);
    const seat = entry ? entry.playerIds.indexOf(playerId) : -1;
    if (seat !== -1) {
        entry.callbacks.onState(playerId, stateFor(entry, seat));
    }
};

const stopGame = (roomCode) => {
    const entry = activeGames.get(roomCode);
    if (entry) {
        entry.game?.stop(); // clears the game's timers
        activeGames.delete(roomCode);
    }
};

export { startGame, handleAction, requestRematch, getMeta, isRunning, sendStateTo, stopGame };
