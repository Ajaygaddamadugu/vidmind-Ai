import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { rateLimit } from '../middleware/rateLimit';
import * as chat from '../controllers/chat.controller';

const router = Router();

const messageLimit = rateLimit({
  name: 'chat',
  windowMs: 60_000,
  max: 12,
  message: "You're asking questions very quickly. Please wait a moment and try again.",
});

router.post('/sessions', asyncHandler(chat.createSession));
router.get('/sessions/:sessionId', asyncHandler(chat.getSession));
router.post('/sessions/:sessionId/messages', messageLimit, asyncHandler(chat.sendMessage));

export default router;
