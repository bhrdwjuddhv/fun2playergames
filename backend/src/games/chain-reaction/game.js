// Chain Reaction rules.
//
// You place an orb in an empty cell or in one of your own. When a cell holds
// as many orbs as it has neighbours, it EXPLODES: one orb goes to each
// neighbour, and those neighbours become yours. That can push them over their
// own limit, and the explosion spreads.
//
// So a corner cell (2 neighbours) explodes at 2, an edge cell at 3, and a
// middle cell at 4.
//
// You win when your opponent has no orbs left — but only once you have both
// played at least once, otherwise the first move would "win" instantly.
//
// The server explodes the board one WAVE at a time and sends each wave to
// both players, so they watch the same chain reaction at the same speed.
// No moves are accepted while a chain is still going.

const SIZES = {
    small: { cols: 5, rows: 7 },
    classic: { cols: 6, rows: 9 },
};

const WAVE_MS = 220;        // pause between explosion waves
const MAX_WAVES = 400;      // a runaway chain can't spin forever

export default {
    id: 'chain-reaction',
    name: 'Chain Reaction',
    description: 'Fill cells until they burst. Take the whole board.',
    emoji: '💥',
    modes: [
        { id: 'small', name: 'Small board' },
        { id: 'classic', name: 'Classic board' },
    ],

    create(api, { matchNumber, mode }) {
        const { cols, rows } = SIZES[mode] ?? SIZES.small;
        const size = cols * rows;

        // For every cell: which cells touch it (up/down/left/right).
        // The number of neighbours IS the cell's critical mass.
        const neighbours = Array.from({ length: size }, (_, index) => {
            const x = index % cols;
            const y = Math.floor(index / cols);
            const list = [];
            if (x > 0) list.push(index - 1);
            if (x < cols - 1) list.push(index + 1);
            if (y > 0) list.push(index - cols);
            if (y < rows - 1) list.push(index + cols);
            return list;
        });

        const cells = Array.from({ length: size }, () => ({ owner: null, count: 0 }));
        let turn = matchNumber % 2; // rematches swap who starts
        let phase = 'playing';      // 'playing' | 'resolving' (a chain is running)
        let timer = null;
        let wave = 0;               // counts every explosion wave (the client uses it for sound)
        let lastExplosions = [];
        const placed = [0, 0];      // how many times each player has placed an orb

        const orbsOf = (seat) =>
            cells.reduce((total, cell) => total + (cell.owner === seat ? cell.count : 0), 0);

        // Only once BOTH players have placed at least one orb.
        const eliminatedSeat = () => {
            if (placed[0] === 0 || placed[1] === 0) return -1;
            if (orbsOf(0) === 0) return 0;
            if (orbsOf(1) === 0) return 1;
            return -1;
        };

        const finish = (winnerSeat) => {
            clearTimeout(timer);
            api.end({ winnerSeat, scores: [orbsOf(0), orbsOf(1)] });
        };

        const endTurn = () => {
            phase = 'playing';
            lastExplosions = [];
            turn = 1 - turn;
            api.update();
        };

        // One wave: every cell that is full explodes at the same moment.
        const explodeWave = (mover) => {
            const ready = [];
            for (let index = 0; index < size; index += 1) {
                if (cells[index].count >= neighbours[index].length) ready.push(index);
            }

            if (ready.length === 0) {
                endTurn();
                return;
            }

            wave += 1;
            lastExplosions = ready;

            for (const index of ready) {
                const cell = cells[index];
                cell.count -= neighbours[index].length;
                if (cell.count === 0) cell.owner = null;

                for (const neighbour of neighbours[index]) {
                    cells[neighbour].count += 1;
                    cells[neighbour].owner = mover; // captured
                }
            }

            api.update(); // both players see this wave

            const loser = eliminatedSeat();
            if (loser !== -1) {
                finish(1 - loser);
                return;
            }
            if (wave >= MAX_WAVES) {
                // Should never happen, but never leave a game spinning.
                finish(orbsOf(0) === orbsOf(1) ? null : orbsOf(0) > orbsOf(1) ? 0 : 1);
                return;
            }

            timer = setTimeout(() => explodeWave(mover), WAVE_MS);
        };

        return {
            getState() {
                // Nothing is secret: both players see the same board.
                return {
                    cols,
                    rows,
                    // Each cell as [owner, count] keeps the message small.
                    cells: cells.map((cell) => [cell.owner, cell.count]),
                    critical: neighbours.map((list) => list.length),
                    turn,
                    phase,
                    wave,
                    lastExplosions,
                    orbs: [orbsOf(0), orbsOf(1)],
                };
            },

            handleAction(seat, action) {
                if (action.type !== 'place') throw new Error('Unknown move');
                if (phase !== 'playing') throw new Error('Wait for the board to settle');
                if (seat !== turn) throw new Error("It's not your turn");

                const index = action.cell;
                if (!Number.isInteger(index) || index < 0 || index >= size) {
                    throw new Error('Invalid cell');
                }
                const cell = cells[index];
                if (cell.owner !== null && cell.owner !== seat) {
                    throw new Error('That cell belongs to your opponent');
                }

                cell.owner = seat;
                cell.count += 1;
                placed[seat] += 1;

                // Full cell → start the chain. Otherwise the turn simply passes.
                if (cell.count >= neighbours[index].length) {
                    phase = 'resolving';
                    api.update();
                    timer = setTimeout(() => explodeWave(seat), WAVE_MS);
                    return;
                }

                const loser = eliminatedSeat();
                if (loser !== -1) {
                    finish(1 - loser);
                    return;
                }
                endTurn();
            },

            stop() {
                clearTimeout(timer);
            },
        };
    },
};
