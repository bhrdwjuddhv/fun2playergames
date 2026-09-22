// F1 Dodge Race rules.
//
// The SERVER runs the race: it moves obstacles, checks collisions, takes
// lives and counts score, 20 times a second ("ticks"). The client only
// says "I want to be in lane 2" and draws what the server sends.
//
// Positions use a "track" coordinate: y = 0 is the top of the screen,
// y = 1 is the bottom. Obstacles move down (y grows). Cars stay at CAR_Y.

const LANES = 3;
const TICK_MS = 50;              // 20 updates per second
const RACE_MS = 90_000;          // the race ends after 90 seconds
const START_LIVES = 3;
const HIT_GRACE_MS = 1500;       // after a hit you can't be hit again for 1.5s

const CAR_Y = 0.8;               // top of the car
const CAR_HEIGHT = 0.12;
const OBSTACLE_HEIGHT = 0.08;

const START_SPEED = 0.45;        // screen-heights per second
const SPEED_UP = 0.008;          // extra speed per second of racing
const OBSTACLE_TYPES = ['car', 'barrier', 'oil', 'cone'];

const randomItem = (list) => list[Math.floor(Math.random() * list.length)];

// Score = distance travelled + a bonus for every life you still have.
const scoreOf = (car) => Math.floor(car.distance * 100) + car.lives * 100;

export default {
    id: 'f1-dodge',
    name: 'F1 Dodge Race',
    description: 'Dodge the traffic. 3 lives. Last car driving wins.',
    emoji: '🏎️',

    create(api) {
        const startedAt = Date.now();
        let lastTickAt = startedAt;
        let speed = START_SPEED;
        let obstacles = [];
        let nextObstacleId = 1;
        let secondsUntilSpawn = 1;

        const cars = [0, 1].map(() => ({
            lane: 1,            // start in the middle lane
            lives: START_LIVES,
            alive: true,
            distance: 0,
            invincibleUntil: 0,
        }));

        const spawnObstacles = () => {
            // 1 obstacle, sometimes 2 — never all lanes, so there is always a way through.
            const count = Math.random() < 0.35 ? 2 : 1;
            const freeLanes = [0, 1, 2].sort(() => Math.random() - 0.5);
            for (const lane of freeLanes.slice(0, count)) {
                obstacles.push({
                    id: nextObstacleId++,
                    lane,
                    y: -OBSTACLE_HEIGHT,          // just above the screen
                    type: randomItem(OBSTACLE_TYPES),
                    hitSeats: [],                 // who already crashed into it
                });
            }
        };

        const checkCollisions = (now) => {
            cars.forEach((car, seat) => {
                if (!car.alive || now < car.invincibleUntil) return;

                const hit = obstacles.find((obstacle) =>
                    obstacle.lane === car.lane
                    && !obstacle.hitSeats.includes(seat)
                    && obstacle.y + OBSTACLE_HEIGHT > CAR_Y     // bottom of obstacle below car top
                    && obstacle.y < CAR_Y + CAR_HEIGHT);        // top of obstacle above car bottom
                if (!hit) return;

                hit.hitSeats.push(seat);
                car.lives -= 1;
                car.invincibleUntil = now + HIT_GRACE_MS;
                if (car.lives <= 0) {
                    car.alive = false; // eliminated; the other car keeps racing
                }
            });
        };

        const finish = () => {
            const scores = cars.map(scoreOf);
            let winnerSeat = null; // draw
            if (scores[0] > scores[1]) winnerSeat = 0;
            if (scores[1] > scores[0]) winnerSeat = 1;
            api.end({ winnerSeat, scores });
        };

        const tick = () => {
            const now = Date.now();
            const seconds = (now - lastTickAt) / 1000;
            lastTickAt = now;
            const raceSeconds = (now - startedAt) / 1000;

            speed = START_SPEED + raceSeconds * SPEED_UP;

            for (const obstacle of obstacles) {
                obstacle.y += speed * seconds;
            }
            obstacles = obstacles.filter((obstacle) => obstacle.y < 1.1); // gone off screen

            // Spawn faster as the race goes on (but never faster than every 0.45s).
            secondsUntilSpawn -= seconds;
            if (secondsUntilSpawn <= 0) {
                spawnObstacles();
                secondsUntilSpawn = Math.max(0.45, 1.1 - raceSeconds * 0.008);
            }

            checkCollisions(now);

            for (const car of cars) {
                if (car.alive) car.distance += speed * seconds;
            }

            const everyoneOut = cars.every((car) => !car.alive);
            if (everyoneOut || now - startedAt >= RACE_MS) {
                finish();
                return;
            }
            api.update();
        };

        const interval = setInterval(tick, TICK_MS);

        return {
            getState() {
                const now = Date.now();
                return {
                    // The client needs these to draw things in the right place.
                    config: { lanes: LANES, carY: CAR_Y, carHeight: CAR_HEIGHT, obstacleHeight: OBSTACLE_HEIGHT },
                    timeLeftMs: Math.max(0, RACE_MS - (now - startedAt)),
                    speed,
                    obstacles: obstacles.map(({ id, lane, y, type }) => ({ id, lane, y, type })),
                    cars: cars.map((car) => ({
                        lane: car.lane,
                        lives: car.lives,
                        alive: car.alive,
                        score: scoreOf(car),
                        invincible: now < car.invincibleUntil, // client makes the car blink
                    })),
                };
            },

            handleAction(seat, action) {
                if (action.type !== 'lane') {
                    throw new Error('Unknown action');
                }
                const car = cars[seat];
                if (!car.alive) {
                    throw new Error('You are out of lives');
                }
                if (!Number.isInteger(action.lane) || action.lane < 0 || action.lane >= LANES) {
                    throw new Error('Invalid lane');
                }
                // ponytail: lane changes are instant on the server; the client
                // animates the slide. Add a lane-change cooldown if players spam.
                car.lane = action.lane;
            },

            stop() {
                clearInterval(interval);
            },
        };
    },
};
