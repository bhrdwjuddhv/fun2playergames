// room.controller.js
// HTTP handlers for rooms. Controllers stay THIN:
// read the request → call room.service → send the response.
//
// Creating/joining rooms happens over SOCKETS (room.socket.js), because
// there the server reads socket.id itself instead of trusting the client.

import * as roomService from '../services/room.service.js';
import { ApiResponse, asyncHandler } from '../utils/index.js';

// GET /api/rooms/:roomCode — "does this room exist, and is there space?"
const getRoom = asyncHandler(async (req, res) => {
    const room = await roomService.getRoom(req.params.roomCode);

    // FIX (security): don't send the whole room document. It contains every
    // player's playerId, and knowing someone's playerId lets you rejoin as them.
    const summary = {
        roomCode: room.roomCode,
        status: room.status,
        playerCount: room.players.length,
    };

    return res.status(200).json(
        new ApiResponse(200, { room: summary }, 'Room fetched successfully')
    );
});

export { getRoom };
