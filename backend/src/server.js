// server.js is the ENTRY POINT. It starts everything, in this order:
// 1. connect to MongoDB  2. create the HTTP + Socket.IO server
// 3. register socket events  4. start listening

import { createServer } from 'node:http';
import os from 'node:os';
import { Server } from 'socket.io';
import app from './app.js';
import connectDb from './config/db.js';
import { registerSockets } from './sockets/index.js';
import { PORT, CLIENT_URL } from './constants.js';

// Don't accept players before the database is ready.
await connectDb();

const server = createServer(app);

// FIX: without a cors setting, a frontend on another port/website is blocked.
const io = new Server(server, { cors: { origin: CLIENT_URL } });

// FIX: registerSockets was used but never imported → crash on start.
registerSockets(io);

server.listen(PORT, () => {
    console.log(`🎮 Server running at http://localhost:${PORT}`);

    // Print this computer's Wi-Fi/LAN address, so you can open the game on
    // your phone (the phone must be on the same Wi-Fi network).
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const address of addresses ?? []) {
            if (address.family === 'IPv4' && !address.internal) {
                console.log(`📱 On your phone:   http://${address.address}:${PORT}`);
            }
        }
    }
});
