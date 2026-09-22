// Frontend game registry: game id (same as the backend's) → screen component.
// Adding a game = add its component here + its rules file on the backend.

import TicTacToe from './TicTacToe.jsx'
import WeDraw from './WeDraw.jsx'
import F1Dodge from './F1Dodge.jsx'

export const gameScreens = {
  'tic-tac-toe': TicTacToe,
  wedraw: WeDraw,
  'f1-dodge': F1Dodge,
}
