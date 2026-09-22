// The GAME REGISTRY: one list of every game the server knows.
// Generic code (voting, game.service) asks this file for a game by id,
// so room code never needs "if (game === 'chess') ..." checks.
//
// Adding a game = create games/<name>/game.js + add one line below.
//
// EVERY game module has the same shape (the "contract"):
//   id, name, description, emoji
//   modes (optional): [{ id, name }] — the first one is the default
//   create(api, { matchNumber, mode }) → returns an object with:
//     getState(seat)             what this player (seat 0 or 1) may see
//     handleAction(seat, action) apply a move; throw an Error if it's invalid.
//                                Whatever it returns is sent back to the player.
//     stop()                     clear timers (called when the game ends/stops)
//   The game calls api.update() when its state changed, and
//   api.end({ winnerSeat }) when it's over (winnerSeat null = draw).
// Game files are PURE rules: no sockets, no database, no Express.

import ticTacToe from './tic-tac-toe/game.js';
import weDraw from './wedraw/game.js';
import f1Dodge from './f1-dodge/game.js';
import rockPaperScissors from './rock-paper-scissors/game.js';
import wordChain from './word-chain/game.js';
import shootingRange from './shooting-range/game.js';

const games = {
    [ticTacToe.id]: ticTacToe,
    [weDraw.id]: weDraw,
    [f1Dodge.id]: f1Dodge,
    [rockPaperScissors.id]: rockPaperScissors,
    [wordChain.id]: wordChain,
    [shootingRange.id]: shootingRange,
};

// Object.hasOwn: a plain `games[id]` would also "find" built-in object
// properties like "constructor" or "toString" if a client sent those.
export const getGame = (gameId) => (Object.hasOwn(games, gameId) ? games[gameId] : null);

// The public info the voting screen shows.
export const gameList = Object.values(games).map(({ id, name, description, emoji, modes }) => ({
    id,
    name,
    description,
    emoji,
    modes: modes ?? null,
}));
