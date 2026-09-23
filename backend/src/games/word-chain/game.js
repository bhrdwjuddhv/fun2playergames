// Word Chain rules.
//
// Players take turns. Each word must start with the LAST letter of the
// previous word (apple → elephant → tiger → …).
// You lose the round if you:
//   - run out of time
//   - play a word that isn't in the dictionary
//   - play a word with the wrong first letter
//   - repeat a word already used this round
// The turn timer shrinks as the chain gets longer (more pressure).
// First to win 2 rounds wins the match.

const ROUNDS_TO_WIN = 2;
const MIN_WORD_LENGTH = 3;
const MAX_WORD_LENGTH = 30;
const START_TURN_MS = 15_000;
const MIN_TURN_MS = 7_000;
const ROUND_OVER_MS = 5_000;

// 15s at the start, 1s less every 3 words, never below 7s.
const turnTimeFor = (chainLength) => Math.max(MIN_TURN_MS, START_TURN_MS - Math.floor(chainLength / 3) * 1000);

export default {
    id: 'word-chain',
    name: 'Word Chain',
    description: 'Apple → Elephant → Tiger… Keep the chain alive before time runs out.',
    emoji: '🔤',

    // `env` gives a game access to the Worker's bindings. Word Chain uses the
    // D1 database, where all 275,000 English words are stored. (Putting the
    // list in the code itself would make the Worker slow to start.)
    create(api, { matchNumber, env }) {
        const isRealWord = async (word) => {
            const row = await env.DB.prepare('SELECT 1 AS found FROM words WHERE word = ?').bind(word).first();
            return Boolean(row);
        };

        let round = 0;
        let phase = 'playing';
        let turn = 0;
        let turnEndsAt = 0;
        let turnMs = START_TURN_MS;
        let timer = null;
        let chain = [];         // [{ word, seat }]
        let used = new Set();
        let lastRound = null;   // { loserSeat, reason }
        const scores = [0, 0];
        let longestChain = 0;

        const requiredLetter = () => (chain.length ? chain[chain.length - 1].word.slice(-1) : null);

        const startTurn = (seat) => {
            turn = seat;
            turnMs = turnTimeFor(chain.length);
            turnEndsAt = Date.now() + turnMs;
            clearTimeout(timer);
            timer = setTimeout(() => loseRound(seat, 'ran out of time'), turnMs);
            api.update();
        };

        const startRound = () => {
            round += 1;
            phase = 'playing';
            chain = [];
            used = new Set();
            lastRound = null;
            // The starting player alternates every round (and every rematch).
            startTurn((round - 1 + matchNumber) % 2);
        };

        const loseRound = (loserSeat, reason) => {
            clearTimeout(timer);
            const winnerSeat = 1 - loserSeat;
            scores[winnerSeat] += 1;
            longestChain = Math.max(longestChain, chain.length);
            lastRound = { loserSeat, reason };
            phase = 'roundOver';
            turnEndsAt = Date.now() + ROUND_OVER_MS;
            api.update();

            timer = setTimeout(() => {
                if (scores[winnerSeat] >= ROUNDS_TO_WIN) {
                    api.end({ winnerSeat, scores, longestChain });
                } else {
                    startRound();
                }
            }, ROUND_OVER_MS);
        };

        startRound();

        return {
            getState() {
                // Nothing is secret in this game: both players see the same thing.
                return {
                    round,
                    roundsToWin: ROUNDS_TO_WIN,
                    phase,
                    turn,
                    timeLeftMs: Math.max(0, turnEndsAt - Date.now()),
                    turnMs,
                    requiredLetter: requiredLetter(),
                    chain,
                    scores,
                    lastRound,
                    longestChain: Math.max(longestChain, chain.length),
                };
            },

            // async, because looking a word up in the database takes a moment.
            async handleAction(seat, action) {
                if (action.type !== 'word') throw new Error('Unknown action');
                if (phase !== 'playing') throw new Error('Wait for the next round');
                if (seat !== turn) throw new Error("It's not your turn");
                if (typeof action.word !== 'string') throw new Error('Type a word');

                const word = action.word.trim().toLowerCase();

                // Typing mistakes that aren't a "move" (empty, symbols, too
                // short) are just rejected — they don't cost the round.
                if (!/^[a-z]+$/.test(word)) throw new Error('Letters only, one word');
                if (word.length < MIN_WORD_LENGTH) throw new Error(`At least ${MIN_WORD_LENGTH} letters`);
                if (word.length > MAX_WORD_LENGTH) throw new Error('That word is too long');

                // Real moves that break the rules DO cost the round.
                const letter = requiredLetter();
                if (letter && word[0] !== letter) {
                    loseRound(seat, `“${word}” doesn’t start with ${letter.toUpperCase()}`);
                    return { accepted: false };
                }
                if (used.has(word)) {
                    loseRound(seat, `“${word}” was already used`);
                    return { accepted: false };
                }
                if (!(await isRealWord(word))) {
                    // While we waited for the database the round may have ended
                    // (the timer ran out) — then this word doesn't count.
                    if (phase !== 'playing' || seat !== turn) return { accepted: false };
                    loseRound(seat, `“${word}” isn’t in the dictionary`);
                    return { accepted: false };
                }
                if (phase !== 'playing' || seat !== turn) return { accepted: false };

                chain.push({ word, seat });
                used.add(word);
                startTurn(1 - seat);
                return { accepted: true };
            },

            stop() {
                clearTimeout(timer);
            },
        };
    },
};
