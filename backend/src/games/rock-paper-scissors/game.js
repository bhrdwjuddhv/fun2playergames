// Rock Paper Scissors rules.
//
// Each round:
//   1. choosing  — both players pick in secret (max 15s).
//                  The server NEVER sends your opponent's pick before the
//                  reveal, only "they have locked in".
//   2. countdown — both picked → "3… 2… 1…" (3s), same moment for both.
//   3. reveal    — both picks shown, round winner decided (3s).
// First to win the needed rounds (best of 3/5/7) wins the match.
// Draw rounds don't count.

const CHOOSE_MS = 15_000;
const COUNTDOWN_MS = 3_000;
const REVEAL_MS = 3_000;

const CHOICES = ['rock', 'paper', 'scissors'];
// What each choice beats.
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

// Returns the winning seat, or null for a draw.
// A missing choice (ran out of time) always loses.
const roundWinner = (choices) => {
    const [a, b] = choices;
    if (a === b) return null;
    if (!a) return 1;
    if (!b) return 0;
    return BEATS[a] === b ? 0 : 1;
};

export default {
    id: 'rock-paper-scissors',
    name: 'Rock Paper Scissors',
    description: 'Pick in secret, reveal together. Best of 3, 5 or 7.',
    emoji: '✊',
    modes: [
        { id: 'bo3', name: 'Best of 3' },
        { id: 'bo5', name: 'Best of 5' },
        { id: 'bo7', name: 'Best of 7' },
    ],

    create(api, { mode }) {
        const bestOf = Number(mode.slice(2)); // "bo5" → 5
        const winsNeeded = Math.ceil(bestOf / 2);

        let round = 0;
        let phase = 'choosing';
        let phaseEndsAt = 0;
        let timer = null;
        let choices = [null, null];
        const scores = [0, 0];
        const history = []; // [{ choices: ['rock', 'paper'], winnerSeat: 1 }]

        const startPhase = (name, durationMs, onTimeUp) => {
            phase = name;
            phaseEndsAt = Date.now() + durationMs;
            clearTimeout(timer);
            timer = setTimeout(onTimeUp, durationMs);
            api.update();
        };

        const startRound = () => {
            round += 1;
            choices = [null, null];
            startPhase('choosing', CHOOSE_MS, startCountdown);
        };

        const startCountdown = () => startPhase('countdown', COUNTDOWN_MS, reveal);

        const reveal = () => {
            const winnerSeat = roundWinner(choices);
            if (winnerSeat !== null) scores[winnerSeat] += 1;
            history.push({ choices: [...choices], winnerSeat });

            const matchWinner = scores.findIndex((score) => score >= winsNeeded);
            startPhase('reveal', REVEAL_MS, () => {
                if (matchWinner === -1) startRound();
                else api.end({ winnerSeat: matchWinner, scores });
            });
        };

        startRound();

        return {
            getState(seat) {
                const showBoth = phase === 'reveal';
                return {
                    bestOf,
                    winsNeeded,
                    round,
                    phase,
                    timeLeftMs: Math.max(0, phaseEndsAt - Date.now()),
                    scores,
                    myChoice: choices[seat],
                    // Only WHETHER they chose — never WHAT — until the reveal.
                    opponentLocked: choices[1 - seat] !== null,
                    revealed: showBoth ? choices : null,
                    history, // finished rounds only
                };
            },

            handleAction(seat, action) {
                if (action.type !== 'choose') throw new Error('Unknown action');
                if (phase !== 'choosing') throw new Error('Wait for the next round');
                if (!CHOICES.includes(action.choice)) throw new Error('Invalid choice');
                if (choices[seat] !== null) throw new Error('You already locked in');

                choices[seat] = action.choice;
                if (choices[0] && choices[1]) {
                    startCountdown(); // both ready → 3… 2… 1…
                } else {
                    api.update(); // tells the opponent "they locked in"
                }
            },

            stop() {
                clearTimeout(timer);
            },
        };
    },
};
