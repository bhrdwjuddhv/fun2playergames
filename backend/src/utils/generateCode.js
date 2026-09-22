import { customAlphabet } from "nanoid";

const generateRoomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

export default generateRoomCode;

