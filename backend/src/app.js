// app.js only BUILDS the Express app. server.js starts it.

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import roomRoutes from './routes/room.routes.js';
import { CLIENT_URL } from './constants.js';

const app = express();

// In production, the BUILT React app (frontend/dist, made by "npm run build")
// is served by this same server. During development Vite serves the frontend
// instead, and forwards /socket.io and /api here (see frontend/vite.config.js).
const frontendDir = fileURLToPath(new URL('../../frontend/dist', import.meta.url));

app.use(cors({ origin: CLIENT_URL }));

// FIX: without express.json(), req.body is always undefined.
// The limit stops someone from sending a huge body to slow the server down.
app.use(express.json({ limit: '10kb' }));

app.use('/api/rooms', roomRoutes);
app.use(express.static(frontendDir));

// Error-handling middleware. Express knows it's an error handler because it
// has 4 arguments. asyncHandler sends every thrown error here via next(err).
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || err.status || 500;

    // Unexpected errors (bugs) are logged, and the real message is hidden
    // from the client: it could reveal details about the server.
    if (statusCode >= 500) {
        console.error(err);
    }

    res.status(statusCode).json({
        success: false,
        message: statusCode >= 500 ? 'Something went wrong' : err.message,
        errors: err.errors || [],
    });
});

export default app;
