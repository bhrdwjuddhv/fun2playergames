import { Router } from 'express';
import { getRoom } from '../controllers/room.controller.js';

const router = Router();

router.get('/:roomCode', getRoom);

export default router;
