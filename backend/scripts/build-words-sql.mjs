// Turns the English word list (an npm package) into one SQL file, so the
// words can live in D1 instead of being bundled into the Worker.
// Run with: npm run words:build

import words from 'an-array-of-english-words' with { type: 'json' };
import { writeFileSync } from 'node:fs';

const WORDS_PER_INSERT = 500; // fewer, bigger statements = a much faster import

const usable = words.filter((word) => /^[a-z]{3,20}$/.test(word));

const lines = ['DELETE FROM words;'];
for (let i = 0; i < usable.length; i += WORDS_PER_INSERT) {
    const chunk = usable.slice(i, i + WORDS_PER_INSERT);
    lines.push(`INSERT OR IGNORE INTO words (word) VALUES ${chunk.map((word) => `('${word}')`).join(',')};`);
}

writeFileSync(new URL('../schemas/words.sql', import.meta.url), lines.join('\n'));
console.log(`words.sql written: ${usable.length} words in ${lines.length - 1} statements`);
