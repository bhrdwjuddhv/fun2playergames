// A short, easy-to-read room code.
// crypto.getRandomValues works everywhere (Workers and browsers) and is
// properly random, unlike Math.random().
// The alphabet leaves out look-alike characters (0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

const generateRoomCode = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
    return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
};

export default generateRoomCode;
