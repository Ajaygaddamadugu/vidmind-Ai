import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { rateLimit } from '../middleware/rateLimit';
import * as downloads from '../controllers/download.controller';

const router = Router();

const startLimit = rateLimit({
  name: 'download-start',
  windowMs: 10 * 60_000,
  max: 10,
  message: 'You have started a lot of downloads. Please wait a few minutes before starting another.',
});

router.post('/', startLimit, asyncHandler(downloads.startDownload));
router.get('/:id', asyncHandler(downloads.downloadStatus));
router.post('/:id/cancel', asyncHandler(downloads.cancel));
router.get('/:id/file', asyncHandler(downloads.downloadFile));

export default router;
