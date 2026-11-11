import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { rateLimit } from '../middleware/rateLimit';
import * as video from '../controllers/video.controller';

const router = Router();

// Analyzing hits YouTube; summaries hit the LLM — keep both on a tighter budget.
const analyzeLimit = rateLimit({ name: 'analyze', windowMs: 60_000, max: 15 });
const summaryLimit = rateLimit({ name: 'summary', windowMs: 60_000, max: 10 });

router.post('/', analyzeLimit, asyncHandler(video.analyzeVideo));
router.get('/:videoId', analyzeLimit, asyncHandler(video.getVideo));
router.get('/:videoId/status', asyncHandler(video.getStatus));
router.get('/:videoId/transcript', asyncHandler(video.getTranscript));
router.get('/:videoId/subtitles.srt', asyncHandler(video.getSubtitles));
router.get('/:videoId/summary', summaryLimit, asyncHandler(video.getVideoSummary));

export default router;
