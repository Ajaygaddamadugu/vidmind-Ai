import { Request, Response } from 'express';
import fs from 'fs';
import { extractVideoId } from '../utils/youtube';
import { HttpError } from '../utils/httpError';
import { cancelDownload, createDownload, getDownload, publicJob } from '../services/download.service';

/** POST /api/downloads  { videoId, qualityId, audioTrackId?, embedSubtitles? } */
export async function startDownload(req: Request, res: Response) {
  const { videoId: rawId, qualityId, audioTrackId, embedSubtitles } = req.body || {};
  const videoId = extractVideoId(rawId);
  if (!videoId) throw new HttpError(400, 'Invalid video ID.');
  if (typeof qualityId !== 'string' || !qualityId) throw new HttpError(400, 'Please choose a quality.');

  const job = await createDownload({
    videoId,
    qualityId,
    audioTrackId: typeof audioTrackId === 'string' ? audioTrackId : undefined,
    embedSubtitles: embedSubtitles === true,
  });
  res.status(202).json({ success: true, data: publicJob(job) });
}

/** GET /api/downloads/:id */
export async function downloadStatus(req: Request, res: Response) {
  res.json({ success: true, data: publicJob(getDownload(req.params.id)) });
}

/** POST /api/downloads/:id/cancel */
export async function cancel(req: Request, res: Response) {
  res.json({ success: true, data: publicJob(cancelDownload(req.params.id)) });
}

/** GET /api/downloads/:id/file — can be fetched again until the job expires */
export async function downloadFile(req: Request, res: Response) {
  const job = getDownload(req.params.id);
  if (job.status !== 'completed' || !job.filePath || !fs.existsSync(job.filePath)) {
    throw new HttpError(409, 'The file is not ready yet.');
  }
  res.download(job.filePath, job.fileName || 'video.mp4', (err) => {
    if (err && !res.headersSent) res.status(500).end();
  });
}
