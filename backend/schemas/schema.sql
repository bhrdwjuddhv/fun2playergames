-- Rooms and players live in D1 (SQL). The live game (board, timers, cars)
-- lives in the room's Durable Object, because it changes far too often
-- for a database.

DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS rooms;

CREATE TABLE rooms (
  room_code     TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'waiting',  
  selected_game TEXT,
  selected_mode TEXT,
  created_at    INTEGER NOT NULL,                
  updated_at    INTEGER NOT NULL
);

CREATE TABLE players (
  room_code TEXT NOT NULL REFERENCES rooms(room_code) ON DELETE CASCADE,
  seat      INTEGER NOT NULL,                    
  player_id TEXT NOT NULL,                       
  name      TEXT NOT NULL DEFAULT 'Player',
  connected INTEGER NOT NULL DEFAULT 1,           
  vote      TEXT,                                 
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_code, seat)
);

CREATE INDEX idx_players_player ON players (room_code, player_id);
CREATE INDEX idx_rooms_updated ON rooms (updated_at);

