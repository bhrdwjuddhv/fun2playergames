// Words and short phrases for WeDraw. Keep them easy to draw.
const WORDS = [
    'apple', 'banana', 'pizza', 'ice cream', 'cake', 'donut', 'carrot', 'burger',
    'cat', 'dog', 'fish', 'bird', 'snake', 'spider', 'elephant', 'giraffe',
    'rabbit', 'turtle', 'octopus', 'penguin', 'butterfly', 'snail', 'frog', 'shark',
    'house', 'castle', 'bridge', 'tent', 'lighthouse', 'windmill', 'igloo', 'ladder',
    'car', 'bicycle', 'rocket', 'airplane', 'boat', 'train', 'helicopter', 'bus',
    'sun', 'moon', 'star', 'rainbow', 'cloud', 'lightning', 'snowman', 'volcano',
    'tree', 'flower', 'cactus', 'mushroom', 'mountain', 'island', 'waterfall', 'leaf',
    'guitar', 'drum', 'umbrella', 'glasses', 'key', 'clock', 'lamp', 'scissors',
    'balloon', 'kite', 'crown', 'sword', 'robot', 'ghost', 'alien', 'dragon',
    'hat', 'shoe', 'sock', 'shirt', 'phone', 'camera', 'book', 'pencil',
    'heart', 'smile', 'hand', 'eye', 'tooth', 'football', 'trophy', 'gift',
];

// Returns `count` different random words.
export const pickWords = (count) => {
    const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
};
