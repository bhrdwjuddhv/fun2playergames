import { Schema, model } from "mongoose";

// NOTE: the live game (board, drawings, car positions) is NOT stored here.
// Games change many times per second (the race updates 20 times a second),
// which is too often for a database. Live game state is kept in memory in
// services/game.service.js. MongoDB stores the room itself: who is in it,
// the votes, which game was picked and the status.

const roomSchema = new Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    players: [
      {
        playerId: {
          type: String,
          required: true,
        },
        // A display name, so players see "Sam" instead of an ID.
        name: {
          type: String,
          default: "Player",
        },
        // null = the player is disconnected right now (they can come back).
        socketId: {
          type: String,
          default: null,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // playerId → gameId (for example "tic-tac-toe")
    votes: {
      type: Map,
      of: String,
      default: {},
    },

    selectedGame: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ["waiting", "voting", "playing", "finished"],
      default: "waiting",
    },
  },
  {
    timestamps: true,
  }
);

// Rooms that nobody has touched for 24 hours are deleted automatically by
// MongoDB (a "TTL index" = time-to-live). No cleanup code needed.
roomSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

const Room = model("Room", roomSchema);

export default Room;
