// Turns the English word list (an npm package) into one file the Worker can
// bundle: src/games/word-chain/words.generated.js
//
// Why generate instead of importing the package directly?
//  - the package is JSON, and a plain string is much faster for the Worker
//    to start up than a 275,000-item array
//  - the generated file stays out of git (it is rebuilt on every deploy)
//
// Cloudflare runs this during the build: see the "Build command" setting.

import words from 'an-array-of-english-words' with { type: 'json' };
import { writeFileSync } from 'node:fs';

const usable = words.filter((word) => /^[a-z]{3,20}$/.test(word));

const file = `// GENERATED FILE — do not edit. Run: npm run build:words
export default '${usable.join(' ')}';
`;

writeFileSync(new URL('../src/games/word-chain/words.generated.js', import.meta.url), file);
console.log(`words.generated.js written: ${usable.length} words`);
