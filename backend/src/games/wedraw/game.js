// WeDraw rules.
//
// Each round:
//   1. drawing  (30s) — each player gets a DIFFERENT secret word and draws it.
//   2. guessing (20s) — the drawings are swapped; each player guesses the
//                       other's word. Correct = 100 points + up to 50 bonus
//                       for guessing fast.
//   3. reveal   (5s)  — both words and drawings are shown.
// After the last round, the higher score wins.
//
// Drawings are sent to the server stroke by stroke, so the server always has
// the full drawing when the timer ends (no "upload at the last second" race).

import { pickWords } from './words.js';

const TOTAL_ROUNDS = 3;
const DRAW_MS = 30_000;
const GUESS_MS = 20_000;
const REVEAL_MS = 5_000;

const COLOR_COUNT = 9;          // must match the palette in the frontend
const SIZE_COUNT = 3;
const MAX_POINTS_PER_STROKE = 500;
const MAX_POINTS_PER_DRAWING = 8000; // stops one player from flooding the server

const BASE_POINTS = 100;
const SPEED_BONUS = 50;

// "Ice-Cream!" → "icecream", so small typing differences don't matter.
const normalize = (text) => text.toLowerCase().replace(/[^a-z]/g, '');

// A stroke is { color, size, points: [x1, y1, x2, y2, ...] }.
// x and y are between 0 and 1 (a fraction of the canvas), so drawings look
// the same on a small phone and a big laptop screen.
const validateStroke = (action) => {
    const { color, size, points } = action;
    if (!Number.isInteger(color) || color < 0 || color >= COLOR_COUNT) {
        throw new Error('Invalid color');
    }
    if (!Number.isInteger(size) || size < 0 || size >= SIZE_COUNT) {
        throw new Error('Invalid brush size');
    }
    if (!Array.isArray(points) || points.length < 2 || points.length % 2 !== 0
        || points.length > MAX_POINTS_PER_STROKE * 2) {
        throw new Error('Invalid stroke');
    }
    const cleanPoints = points.map((value) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new Error('Invalid stroke');
        }
        // Clamp to 0..1 and keep 3 decimals (smaller messages).
        return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
    });
    return { color, size, points: cleanPoints };
};

export default {
    id: 'wedraw',
    name: 'WeDraw',
    description: 'Draw your secret word in 30s, then guess theirs.',
    emoji: '🎨',

    create(api) {
        let round = 0;
        let phase = 'drawing';
        let phaseEndsAt = 0;
        let timer = null;

        let words = [];            // words[seat] = the word that seat draws
        let drawings = [[], []];   // drawings[seat] = list of strokes
        let pointCounts = [0, 0];
        let guessed = [false, false];
        let roundPoints = [0, 0];
        const scores = [0, 0];

        // Starts a phase and schedules what happens when its time runs out.
        const startPhase = (name, durationMs, onTimeUp) => {
            phase = name;
            phaseEndsAt = Date.now() + durationMs;
            clearTimeout(timer);
            timer = setTimeout(onTimeUp, durationMs);
            api.update();
        };

        const startRound = () => {
            round += 1;
            words = pickWords(2);
            drawings = [[], []];
            pointCounts = [0, 0];
            guessed = [false, false];
            roundPoints = [0, 0];
            startPhase('drawing', DRAW_MS, startGuessing);
        };

        const startGuessing = () => startPhase('guessing', GUESS_MS, reveal);

        const reveal = () => startPhase('reveal', REVEAL_MS, round < TOTAL_ROUNDS ? startRound : finish);

        const finish = () => {
            phase = 'done';
            let winnerSeat = null; // draw
            if (scores[0] > scores[1]) winnerSeat = 0;
            if (scores[1] > scores[0]) winnerSeat = 1;
            api.end({ winnerSeat, scores });
        };

        startRound();

        return {
            // IMPORTANT: this decides what each player is allowed to SEE.
            // Your opponent's word is only included once it's revealed.
            getState(seat) {
                const other = 1 - seat;
                const state = {
                    round,
                    totalRounds: TOTAL_ROUNDS,
                    phase,
                    timeLeftMs: Math.max(0, phaseEndsAt - Date.now()),
                    scores,
                    roundPoints,
                    guessed,
                };

                if (phase === 'drawing') {
                    state.myWord = words[seat];
                    state.myDrawing = drawings[seat]; // so a refresh doesn't lose your drawing
                }
                if (phase === 'guessing') {
                    state.theirDrawing = drawings[other];
                    // "ice cream" → "___ _____": shows the length, not the letters.
                    state.hint = words[other].replace(/[a-z]/gi, '_');
                    if (guessed[seat]) {
                        state.theirWord = words[other]; // you already got it
                    }
                }
                if (phase === 'reveal' || phase === 'done') {
                    state.words = words;
                    state.drawings = drawings;
                }
                return state;
            },

            handleAction(seat, action) {
                if (action.type === 'stroke') {
                    if (phase !== 'drawing') throw new Error('Drawing time is over');
                    const stroke = validateStroke(action);
                    const newCount = pointCounts[seat] + stroke.points.length / 2;
                    if (newCount > MAX_POINTS_PER_DRAWING) {
                        throw new Error('Your drawing is too big');
                    }
                    pointCounts[seat] = newCount;
                    drawings[seat].push(stroke);
                    return; // no update needed: the opponent can't see it yet
                }

                if (action.type === 'undo' || action.type === 'clear') {
                    if (phase !== 'drawing') throw new Error('Drawing time is over');
                    if (action.type === 'undo') {
                        drawings[seat].pop();
                    } else {
                        drawings[seat] = [];
                    }
                    pointCounts[seat] = drawings[seat].reduce((sum, s) => sum + s.points.length / 2, 0);
                    return;
                }

                if (action.type === 'guess') {
                    if (phase !== 'guessing') throw new Error("It's not guessing time");
                    if (guessed[seat]) throw new Error('You already guessed it');
                    if (typeof action.text !== 'string' || action.text.length > 50) {
                        throw new Error('Invalid guess');
                    }
                    const guess = normalize(action.text);
                    if (!guess) throw new Error('Type a guess');

                    // The SERVER compares the guess — the client never knows
                    // the answer, so it can't cheat.
                    if (guess !== normalize(words[1 - seat])) {
                        return { correct: false };
                    }

                    const timeLeftMs = Math.max(0, phaseEndsAt - Date.now());
                    const points = BASE_POINTS + Math.round(SPEED_BONUS * (timeLeftMs / GUESS_MS));
                    guessed[seat] = true;
                    roundPoints[seat] = points;
                    scores[seat] += points;

                    if (guessed[0] && guessed[1]) {
                        reveal(); // both got it → no need to wait for the timer
                    } else {
                        api.update();
                    }
                    return { correct: true, points };
                }

                throw new Error('Unknown action');
            },

            stop() {
                clearTimeout(timer);
            },
        };
    },
};
