import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { rateLimit } from '../middleware/rateLimit';
import * as instagram from '../controllers/instagram.controller';

const router = Router();

// Each lookup hits Instagram, which rate-limits aggressively — keep a tight budget.
const lookupLimit = rateLimit({ name: 'instagram', windowMs: 60_000, max: 15 });

router.post('/', lookupLimit, asyncHandler(instagram.analyzeReel));
router.get('/:code', lookupLimit, asyncHandler(instagram.getReel));

export default router;
