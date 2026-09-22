// Shooting Range rules — two modes:
//
//   duel  (Accuracy Duel)  Each player shoots at their OWN copy of the same
//                          targets. 40 seconds, 35 bullets. Highest score wins.
//   coop  (Co-Op Survival) Both players defend one shared core in the middle.
//                          Enemies walk towards it in waves. One team score.
//
// The SERVER decides every hit. The client only says "I shot at (x, y)".
//
// Coordinates: x goes 0 → 1 (left → right), y goes 0 → ARENA_HEIGHT
// (top → bottom). The arena is portrait (3:4), which fits phones.
//
// Everything moves in straight lines, so a position at any moment is
//   start + velocity × time since it appeared.
// That lets the client animate smoothly without 60 updates a second, and
// lets the server check where a target WAS a moment ago (see findHit).

const ARENA_HEIGHT = 4 / 3;
const SHOT_COOLDOWN_MS = 120;      // max ~8 shots a second per player
const HIT_SLACK = 1.25;            // a little forgiveness around each target
// The picture on the player's screen is slightly behind the server (network
// delay). So a shot also counts if it hit where the target was up to 240ms ago.
const REWIND_MS = [0, 60, 120, 180, 240];

// Duel settings
const DUEL_MS = 40_000;
const DUEL_BULLETS = 35;

// Co-op settings
const TOTAL_WAVES = 8;
const CORE = { x: 0.5, y: ARENA_HEIGHT / 2, r: 0.08 };
const CORE_HP = 10;
const WAVE_BREAK_MS = 3_000;
const TICK_MS = 100;

const random = (min, max) => min + Math.random() * (max - min);

const positionAt = (thing, time) => ({
    x: thing.x0 + (thing.vx * (time - thing.born)) / 1000,
    y: thing.y0 + (thing.vy * (time - thing.born)) / 1000,
});

// Which target (if any) did a shot at (x, y) hit? `isAliveAt(target, time)`
// says whether the target existed at that moment.
const findHit = (targets, x, y, now, isAliveAt) => {
    let best = null;
    let bestDistance = Infinity;
    for (const target of targets) {
        for (const back of REWIND_MS) {
            const time = now - back;
            if (!isAliveAt(target, time)) continue;
            const position = positionAt(target, time);
            const distance = Math.hypot(position.x - x, position.y - y);
            if (distance <= target.r * HIT_SLACK && distance < bestDistance) {
                best = target;
                bestDistance = distance;
            }
        }
    }
    return best;
};

// What the client needs to draw something that moves in a straight line.
// ageMs = how long ago it appeared (the client can't use our clock).
const publicMover = (thing, now) => ({
    id: thing.id,
    x0: thing.x0,
    y0: thing.y0,
    vx: thing.vx,
    vy: thing.vy,
    r: thing.r,
    ageMs: now - thing.born,
});

const validShot = (action) =>
    Number.isFinite(action.x) && Number.isFinite(action.y)
    && action.x >= -0.1 && action.x <= 1.1
    && action.y >= -0.1 && action.y <= ARENA_HEIGHT + 0.1;

const accuracyOf = (stats) => (stats.shots ? stats.hits / stats.shots : 0);

// ————————————————————————— Accuracy Duel —————————————————————————

function createDuel(api) {
    const startedAt = Date.now();
    let nextId = 1;
    let targets = [];
    let spawned = 0;
    let spawnTimer = null;
    const endTimer = setTimeout(() => finish(), DUEL_MS);

    const players = [0, 1].map(() => ({
        bullets: DUEL_BULLETS,
        shots: 0,
        hits: 0,
        score: 0,
        reactionTotalMs: 0,
        lastShotAt: 0,
        hitIds: new Set(),
    }));

    const isAliveAt = (target, time) => time >= target.born && time <= target.born + target.ttl;

    const spawnTarget = () => {
        const now = Date.now();
        const r = random(0.05, 0.085);
        const ttl = random(1500, 2400);
        // Pick a start and an end point inside the arena, and move between
        // them — so the target never leaves the screen. 40% stand still.
        const margin = r + 0.02;
        const start = { x: random(margin, 1 - margin), y: random(margin + 0.1, ARENA_HEIGHT - margin) };
        const end = Math.random() < 0.4
            ? start
            : { x: random(margin, 1 - margin), y: random(margin + 0.1, ARENA_HEIGHT - margin) };

        targets = targets.filter((target) => isAliveAt(target, now)); // forget old ones
        targets.push({
            id: nextId++,
            x0: start.x,
            y0: start.y,
            vx: ((end.x - start.x) / ttl) * 1000,
            vy: ((end.y - start.y) / ttl) * 1000,
            r,
            ttl,
            born: now,
        });
        spawned += 1;
        api.update();
        spawnTimer = setTimeout(spawnTarget, random(650, 1000));
    };

    const statsOf = (player) => ({
        score: player.score,
        shots: player.shots,
        hits: player.hits,
        misses: player.shots - player.hits,
        bullets: player.bullets,
        accuracy: Math.round(accuracyOf(player) * 100),
        avgReactionMs: player.hits ? Math.round(player.reactionTotalMs / player.hits) : null,
        targetsSeen: spawned,
    });

    const finish = () => {
        const scores = players.map((player) => player.score);
        let winnerSeat = null;
        if (scores[0] > scores[1]) winnerSeat = 0;
        if (scores[1] > scores[0]) winnerSeat = 1;
        api.end({ winnerSeat, scores });
    };

    spawnTimer = setTimeout(spawnTarget, 800);

    return {
        getState(seat) {
            const now = Date.now();
            const me = players[seat];
            return {
                mode: 'duel',
                arenaHeight: ARENA_HEIGHT,
                timeLeftMs: Math.max(0, DUEL_MS - (now - startedAt)),
                // Your own range: targets you haven't hit yet.
                targets: targets
                    .filter((target) => isAliveAt(target, now) && !me.hitIds.has(target.id))
                    .map((target) => ({ ...publicMover(target, now), ttl: target.ttl })),
                me: statsOf(me),
                opponent: statsOf(players[1 - seat]),
            };
        },

        handleAction(seat, action) {
            if (action.type !== 'shoot') throw new Error('Unknown action');
            if (!validShot(action)) throw new Error('Invalid shot');
            const now = Date.now();
            const player = players[seat];
            if (player.bullets <= 0) throw new Error('Out of bullets');
            if (now - player.lastShotAt < SHOT_COOLDOWN_MS) return { hit: false, ignored: true };

            player.lastShotAt = now;
            player.bullets -= 1;
            player.shots += 1;

            const mine = targets.filter((target) => !player.hitIds.has(target.id));
            const target = findHit(mine, action.x, action.y, now, isAliveAt);
            let points = 0;
            if (target) {
                const reactionMs = Math.min(target.ttl, now - target.born);
                // Fast shots and small targets are worth more.
                points = 100
                    + Math.round(100 * Math.max(0, 1 - reactionMs / target.ttl))
                    + (target.r < 0.065 ? 50 : 0);
                player.hitIds.add(target.id);
                player.hits += 1;
                player.score += points;
                player.reactionTotalMs += reactionMs;
            }

            if (players.every((p) => p.bullets <= 0)) {
                finish(); // both out of bullets → no need to wait for the clock
            } else {
                api.update();
            }
            return { hit: Boolean(target), points, targetId: target?.id ?? null };
        },

        stop() {
            clearTimeout(spawnTimer);
            clearTimeout(endTimer);
        },
    };
}

// ————————————————————————— Co-Op Survival —————————————————————————

function createCoop(api) {
    const startedAt = Date.now();
    let nextId = 1;
    let enemies = [];
    let wave = 0;
    let phase = 'break';           // 'wave' or 'break' (between waves)
    let phaseEndsAt = Date.now() + WAVE_BREAK_MS;
    let toSpawn = 0;
    let nextSpawnAt = 0;
    let coreHp = CORE_HP;
    let combo = 0;
    let bestCombo = 0;
    let killPoints = 0;
    let wavesCleared = 0;
    let damageTaken = 0;
    let recentShots = [];          // so each player sees where their partner shoots

    const players = [0, 1].map(() => ({ shots: 0, hits: 0, kills: 0, lastShotAt: 0 }));

    const isAliveAt = (enemy, time) => time >= enemy.born && time <= enemy.arriveAt;

    const waveSettings = (n) => ({
        count: 6 + n * 3,
        spawnEveryMs: Math.max(350, 1100 - n * 90),
        speed: 0.09 + n * 0.015,
        armoredChance: n >= 3 ? 0.15 + n * 0.04 : 0,
        fastChance: n >= 2 ? 0.2 : 0,
    });

    const spawnEnemy = (now) => {
        const settings = waveSettings(wave);
        const armored = Math.random() < settings.armoredChance;
        const fast = !armored && Math.random() < settings.fastChance;
        const r = armored ? 0.055 : fast ? 0.035 : 0.045;
        const speed = settings.speed * (fast ? 1.6 : armored ? 0.75 : 1);

        // Appear just outside a random edge, then walk straight to the core.
        const edge = Math.floor(Math.random() * 4);
        const along = Math.random();
        const x0 = edge === 0 ? -r : edge === 1 ? 1 + r : along;
        const y0 = edge === 2 ? -r : edge === 3 ? ARENA_HEIGHT + r : along * ARENA_HEIGHT;
        const dx = CORE.x - x0;
        const dy = CORE.y - y0;
        const distance = Math.hypot(dx, dy);
        const travel = distance - CORE.r - r; // stop at the core's edge

        enemies.push({
            id: nextId++,
            x0,
            y0,
            vx: (dx / distance) * speed,
            vy: (dy / distance) * speed,
            r,
            hp: armored ? 2 : 1,
            maxHp: armored ? 2 : 1,
            born: now,
            arriveAt: now + (travel / speed) * 1000,
        });
    };

    const finalBreakdown = () => {
        const shots = players[0].shots + players[1].shots;
        const hits = players[0].hits + players[1].hits;
        const accuracy = shots ? hits / shots : 0;
        const waveBonus = wavesCleared * 500;
        const accuracyBonus = Math.round(accuracy * 1000);
        const damagePenalty = damageTaken * 100;
        return {
            killPoints,
            waveBonus,
            accuracyBonus,
            damagePenalty,
            total: Math.max(0, killPoints + waveBonus + accuracyBonus - damagePenalty),
            accuracy: Math.round(accuracy * 100),
            survivedSeconds: Math.round((Date.now() - startedAt) / 1000),
        };
    };

    const finish = (won) => {
        const breakdown = finalBreakdown();
        // Co-op: nobody beats the other, so winnerSeat is null.
        api.end({ winnerSeat: null, coop: true, won, teamScore: breakdown.total });
    };

    const tick = () => {
        const now = Date.now();
        let changed = false;

        if (phase === 'break' && now >= phaseEndsAt) {
            wave += 1;
            phase = 'wave';
            toSpawn = waveSettings(wave).count;
            nextSpawnAt = now;
            changed = true;
        }

        if (phase === 'wave') {
            if (toSpawn > 0 && now >= nextSpawnAt) {
                spawnEnemy(now);
                toSpawn -= 1;
                nextSpawnAt = now + waveSettings(wave).spawnEveryMs;
                changed = true;
            }

            // Enemies that reached the core damage it.
            const arrived = enemies.filter((enemy) => now > enemy.arriveAt);
            if (arrived.length) {
                for (const enemy of arrived) {
                    coreHp -= enemy.hp;
                    damageTaken += enemy.hp;
                }
                enemies = enemies.filter((enemy) => now <= enemy.arriveAt);
                combo = 0;
                changed = true;
                if (coreHp <= 0) {
                    coreHp = 0;
                    finish(false);
                    return;
                }
            }

            if (toSpawn === 0 && enemies.length === 0) {
                wavesCleared += 1;
                if (wave >= TOTAL_WAVES) {
                    finish(true);
                    return;
                }
                phase = 'break';
                phaseEndsAt = now + WAVE_BREAK_MS;
                changed = true;
            }
        }

        const before = recentShots.length;
        recentShots = recentShots.filter((shot) => now - shot.at < 600);
        if (recentShots.length !== before) changed = true;

        if (changed) api.update();
    };

    const interval = setInterval(tick, TICK_MS);

    return {
        getState() {
            const now = Date.now();
            // Both players see the same arena.
            return {
                mode: 'coop',
                arenaHeight: ARENA_HEIGHT,
                core: CORE,
                wave,
                totalWaves: TOTAL_WAVES,
                phase,
                breakLeftMs: phase === 'break' ? Math.max(0, phaseEndsAt - now) : 0,
                coreHp,
                coreMaxHp: CORE_HP,
                enemies: enemies.map((enemy) => ({ ...publicMover(enemy, now), hp: enemy.hp, maxHp: enemy.maxHp })),
                teamScore: killPoints,
                combo,
                bestCombo,
                players: players.map(({ shots, hits, kills }) => ({ shots, hits, kills })),
                recentShots: recentShots.map((shot) => ({ seat: shot.seat, x: shot.x, y: shot.y, hit: shot.hit })),
                breakdown: finalBreakdown(),
            };
        },

        handleAction(seat, action) {
            if (action.type !== 'shoot') throw new Error('Unknown action');
            if (!validShot(action)) throw new Error('Invalid shot');
            const now = Date.now();
            const player = players[seat];
            if (now - player.lastShotAt < SHOT_COOLDOWN_MS) return { hit: false, ignored: true };
            player.lastShotAt = now;
            player.shots += 1;

            const enemy = findHit(enemies, action.x, action.y, now, isAliveAt);
            let points = 0;
            let killed = false;
            if (enemy) {
                player.hits += 1;
                combo += 1;
                bestCombo = Math.max(bestCombo, combo);
                enemy.hp -= 1;
                if (enemy.hp <= 0) {
                    // Later waves and long combos are worth more.
                    points = Math.round(100 * wave * (1 + Math.min(combo, 20) * 0.1));
                    player.kills += 1;
                    killed = true;
                    enemies = enemies.filter((other) => other !== enemy);
                } else {
                    points = 25; // armored enemy: first hit only cracks it
                }
                killPoints += points;
            } else {
                combo = 0; // a miss breaks the team combo
            }

            recentShots.push({ seat, x: action.x, y: action.y, hit: Boolean(enemy), at: now });
            api.update();
            return { hit: Boolean(enemy), points, enemyId: enemy?.id ?? null, killed };
        },

        stop() {
            clearInterval(interval);
        },
    };
}

export default {
    id: 'shooting-range',
    name: 'Shooting Range',
    description: 'Duel for accuracy, or team up to defend the core.',
    emoji: '🎯',
    modes: [
        { id: 'duel', name: 'Accuracy Duel' },
        { id: 'coop', name: 'Co-Op Survival' },
    ],

    create(api, { mode }) {
        return mode === 'coop' ? createCoop(api) : createDuel(api);
    },
};
