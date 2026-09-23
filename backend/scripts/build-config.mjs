// Puts the deploy-time settings into wrangler.jsonc, reading them from
// environment variables. Cloudflare runs this during the build, so the
// database id never has to be committed to GitHub.
//
// Build variables to set in the dashboard (Worker → Settings → Builds):
//   D1_DATABASE_ID  your D1 database id            (required to deploy)
//   CLIENT_ORIGIN   your Pages address, e.g.
//                   https://fun2playergames.pages.dev                (optional)
//
// Nothing happens when the variables are missing, so local development and
// `npm run dev` are unaffected. The file is only changed inside Cloudflare's
// build (a throw-away copy of the repository), never in your commit.

import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG = new URL('../wrangler.jsonc', import.meta.url);

const databaseId = process.env.D1_DATABASE_ID?.trim();
const clientOrigin = process.env.CLIENT_ORIGIN?.trim();

if (!databaseId && !clientOrigin) {
    console.log('build-config: no D1_DATABASE_ID or CLIENT_ORIGIN set — leaving wrangler.jsonc alone');
    process.exit(0);
}

let config = readFileSync(CONFIG, 'utf8');

if (databaseId) {
    if (!/^[0-9a-f-]{36}$/i.test(databaseId)) {
        throw new Error('D1_DATABASE_ID does not look like a database id (36 characters, e.g. 1a2b3c4d-...)');
    }
    // Add "database_id" right after the database name.
    const nameLine = /("database_name":\s*"[^"]+")(,\s*\n\s*"database_id":\s*"[^"]*")?/;
    if (!nameLine.test(config)) throw new Error('could not find "database_name" in wrangler.jsonc');
    config = config.replace(nameLine, `$1,\n\t\t\t"database_id": "${databaseId}"`);
    console.log('build-config: database id added');
}

if (clientOrigin) {
    config = config.replace(/("CLIENT_ORIGIN":\s*)"[^"]*"/, `$1"${clientOrigin}"`);
    console.log(`build-config: CLIENT_ORIGIN set to ${clientOrigin}`);
}

writeFileSync(CONFIG, config);
