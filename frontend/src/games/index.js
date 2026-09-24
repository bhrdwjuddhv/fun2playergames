// Frontend game registry: game id (same as the backend's) → screen component.
// Adding a game = add it here + its rules file on the backend.

import TicTacToe from './TicTacToe.jsx'
import WeDraw from './WeDraw.jsx'
import F1Dodge from './F1Dodge.jsx'
import RockPaperScissors from './RockPaperScissors.jsx'
import WordChain from './WordChain.jsx'
import ShootingRange from './ShootingRange.jsx'
import ChainReaction from './ChainReaction.jsx'

export const gameScreens = {
  'tic-tac-toe': TicTacToe,
  wedraw: WeDraw,
  'f1-dodge': F1Dodge,
  'rock-paper-scissors': RockPaperScissors,
  'word-chain': WordChain,
  'shooting-range': ShootingRange,
  'chain-reaction': ChainReaction,
}

// Shown on the home page before you're in a room (the server's list is only
// sent once you've joined).
export const gameShowcase = [
  { id: 'tic-tac-toe', name: 'Tic-Tac-Toe', note: 'A timeless classic', text: 'Three in a row, turn by turn. Rematches swap who goes first.' },
  { id: 'wedraw', name: 'WeDraw', note: 'Draw & guess', text: 'Sketch your secret word in thirty seconds, then guess theirs. Quick guesses earn a bonus.' },
  { id: 'f1-dodge', name: 'F1 Dodge Race', note: 'Side by side', text: 'Share one road, dodge the traffic, keep your three lives. The last car driving wins.' },
  { id: 'rock-paper-scissors', name: 'Rock Paper Scissors', note: 'A secret choice', text: 'Choose in private, reveal on three. Best of three, five or seven.' },
  { id: 'word-chain', name: 'Word Chain', note: 'Letter to letter', text: 'Each word begins where the last one ended — before the clock runs out.' },
  { id: 'shooting-range', name: 'Shooting Range', note: 'Rivals or allies', text: 'Duel for the sharpest aim, or stand together and defend the core, wave after wave.' },
  { id: 'chain-reaction', name: 'Chain Reaction', note: 'One orb too many', text: 'Fill a cell past its limit and it bursts into its neighbours — sometimes across the whole board.' },
]
