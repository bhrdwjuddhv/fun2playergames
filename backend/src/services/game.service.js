// game.service.js — the GENERIC game engine for ONE room.
//
// It sits between the room's Durable Object and a specific game's rules
// (games/<name>/game.js). No tic-tac-toe or race rules in this file.
//
// The live game is kept in memory inside the Durable Object. That is safe
// here: a Durable Object is a single little server that stays awake while
// players are connected, so its memory IS the room.
//
// HOW PLAYERS ARE IDENTIFIED:
// Games never see playerIds. They only see "seats": 0 and 1. This service
// converts playerId → seat, so game state sent to a player can never
// contain anyone's id.

import { getGame } from '../games/index.js';
import { ApiError } from '../utils/index.js';

// onState(playerId, state) — send one player their view of the game
// onEnd(result)            — the game just finished
// env                      — Worker bindings, for games that need them
//                            (Word Chain looks words up in D1)
export function createGameEngine({ env, onState, onEnd }) {
    let current = null;

    // What one player receives: the game's own state + generic extras.
    // `match` changes on every rematch, so the frontend resets its screen.
    const stateFor = (seat) => ({
        ...current.game.getState(seat),
        result: current.result,
        match: current.matchNumber,
    });

    const sendToEveryone = () => {
        if (!current?.game) return; // still inside create()
        current.playerIds.forEach((playerId, seat) => onState(playerId, stateFor(seat)));
    };

    const start = (gameId, mode, playerIds, matchNumber = 0) => {
        const gameModule = getGame(gameId);
        if (!gameModule) throw new ApiError(400, 'Unknown game');

        stop(); // never run two games in one room

        current = {
            gameId,
            mode,
            playerIds,
            matchNumber,
            game: null,
            result: null,
            rematchSeats: new Set(),
        };

        // Everything a game is allowed to do to the outside world.
        const api = {
            update: sendToEveryone,
            end: (result) => {
                if (current.result) return; // already over
                current.result = result; // { winnerSeat: 0 | 1 | null (draw), ... }
                current.game.stop();
                sendToEveryone();
                onEnd(result);
            },
        };

        current.game = gameModule.create(api, { matchNumber, mode, env });
        sendToEveryone();
    };

    const seatOf = (playerId) => (current ? current.playerIds.indexOf(playerId) : -1);

    const handleAction = async (playerId, action) => {
        if (!current) throw new ApiError(400, 'No game is running');
        if (current.result) throw new ApiError(400, 'The game is over');

        const seat = seatOf(playerId);
        if (seat === -1) throw new ApiError(403, 'You are not playing in this game');
        if (typeof action !== 'object' || action === null) throw new ApiError(400, 'Invalid action');

        // Games throw a normal Error for invalid moves ("Not your turn").
        // We turn it into an ApiError so the message reaches the player.
        // `await`: most games answer immediately, but Word Chain has to look
        // the word up in the database first.
        try {
            return await current.game.handleAction(seat, action);
        } catch (err) {
            if (err instanceof ApiError) throw err;
            throw new ApiError(400, err.message);
        }
    };

    // Both players must ask for a rematch. Returns true when a new game started.
    const requestRematch = (playerId) => {
        if (!current?.result) throw new ApiError(400, 'There is no finished game to rematch');
        const seat = seatOf(playerId);
        if (seat === -1) throw new ApiError(403, 'You are not playing in this game');

        current.rematchSeats.add(seat);
        if (current.rematchSeats.size < current.playerIds.length) return false;

        start(current.gameId, current.mode, current.playerIds, current.matchNumber + 1);
        return true;
    };

    // Extra info the room screen shows (result + who wants a rematch).
    const getMeta = () =>
        current
            ? { result: current.result, rematchSeats: [...current.rematchSeats] }
            : { result: null, rematchSeats: [] };

    // Used when a player (re)joins mid-game, so they see the current board.
    const sendStateTo = (playerId) => {
        const seat = seatOf(playerId);
        if (current?.game && seat !== -1) onState(playerId, stateFor(seat));
    };

    function stop() {
        current?.game?.stop(); // clears the game's timers
        current = null;
    }

    return {
        start,
        handleAction,
        requestRematch,
        getMeta,
        sendStateTo,
        stop,
        isRunning: () => current !== null,
    };
}
