import dotenv from 'dotenv';
dotenv.config({ quiet: true }); // quiet: don't print a message every start

const dbName = process.env.DB_NAME || 'game-playz';
const DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const PORT = Number(process.env.PORT) || 3000;

// Which website is allowed to talk to this server.
// '*' (any) is fine here because the frontend is served by this same server.
// Set CLIENT_URL in .env if you ever host the frontend somewhere else.
const CLIENT_URL = process.env.CLIENT_URL || '*';

export { dbName, DB_URI, PORT, CLIENT_URL };
