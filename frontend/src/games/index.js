// Frontend game registry: game id (same as the backend's) → screen component.
// Adding a game = add it here + its rules file on the backend.

import TicTacToe from './TicTacToe.jsx'
import WeDraw from './WeDraw.jsx'
import F1Dodge from './F1Dodge.jsx'

export const gameScreens = {
  'tic-tac-toe': TicTacToe,
  wedraw: WeDraw,
  'f1-dodge': F1Dodge,
}

// Shown on the home page before you're in a room (the server's list is only
// sent once you've joined).
export const gameShowcase = [
  { id: 'tic-tac-toe', name: 'Tic-Tac-Toe', note: 'A timeless classic', text: 'Three in a row, turn by turn. Rematches swap who goes first.' },
  { id: 'wedraw', name: 'WeDraw', note: 'Draw & guess', text: 'Sketch your secret word in thirty seconds, then guess theirs. Quick guesses earn a bonus.' },
  { id: 'f1-dodge', name: 'F1 Dodge Race', note: 'Side by side', text: 'Share one road, dodge the traffic, keep your three lives. The last car driving wins.' },
]
