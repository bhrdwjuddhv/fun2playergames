-- Rooms and players live in D1 (SQL). The live game (board, timers, cars)
-- lives in the room's Durable Object, because it changes far too often
-- for a database.

DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS rooms;

CREATE TABLE rooms (
  room_code     TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'waiting',  -- waiting | voting | playing | finished
  selected_game TEXT,
  selected_mode TEXT,
  created_at    INTEGER NOT NULL,                 -- milliseconds since 1970
  updated_at    INTEGER NOT NULL
);

CREATE TABLE players (
  room_code TEXT NOT NULL REFERENCES rooms(room_code) ON DELETE CASCADE,
  seat      INTEGER NOT NULL,                     -- 0 or 1
  player_id TEXT NOT NULL,                        -- the id the browser keeps
  name      TEXT NOT NULL DEFAULT 'Player',
  connected INTEGER NOT NULL DEFAULT 1,           -- SQLite has no boolean: 0/1
  vote      TEXT,                                 -- "wedraw" or "rock-paper-scissors:bo5"
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_code, seat)
);

CREATE INDEX idx_players_player ON players (room_code, player_id);
CREATE INDEX idx_rooms_updated ON rooms (updated_at);

