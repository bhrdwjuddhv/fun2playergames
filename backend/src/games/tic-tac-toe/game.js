// Tic-Tac-Toe rules. Seat 0 is X, seat 1 is O.

// Every way to make three in a row (cell numbers 0–8, left→right, top→bottom).
const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6],            // diagonals
];

export default {
    id: 'tic-tac-toe',
    name: 'Tic-Tac-Toe',
    description: 'Classic 3×3. Get three in a row.',
    emoji: '❌',

    create(api, { matchNumber }) {
        const board = Array(9).fill(null); // null = empty, 0 = X, 1 = O
        // Rematches alternate who goes first, so it stays fair.
        let turn = matchNumber % 2;
        let winningLine = null;

        return {
            getState() {
                // Both players see the same board, so `seat` isn't needed here.
                return { board, turn, winningLine };
            },

            handleAction(seat, action) {
                // The server is the referee: check EVERYTHING the client sends.
                if (action.type !== 'place') {
                    throw new Error('Unknown move');
                }
                if (seat !== turn) {
                    throw new Error("It's not your turn");
                }
                const cell = action.cell;
                if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
                    throw new Error('Invalid cell');
                }
                if (board[cell] !== null) {
                    throw new Error('That cell is taken');
                }

                board[cell] = seat;

                winningLine = LINES.find((line) => line.every((i) => board[i] === seat)) ?? null;
                if (winningLine) {
                    api.end({ winnerSeat: seat });
                    return;
                }
                if (board.every((value) => value !== null)) {
                    api.end({ winnerSeat: null }); // board full, no line → draw
                    return;
                }

                turn = 1 - turn; // 0 → 1, 1 → 0
                api.update();
            },

            stop() {}, // no timers in this game
        };
    },
};
