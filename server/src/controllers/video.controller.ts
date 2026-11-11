import { Request, Response } from 'express';
import { extractVideoId } from '../utils/youtube';
import { HttpError } from '../utils/httpError';
import { toSrt } from '../utils/time';
import {
  ensurePrepared,
  getPrepStatus,
  getSummary,
  getTranscriptData,
  getVideoInfo,
} from '../services/video.service';

function videoIdParam(req: Request): string {
  const id = extractVideoId(req.params.videoId);
  if (!id) throw new HttpError(400, 'Invalid video ID.');
  return id;
}

/** POST /api/videos  { url }  → metadata + preparation status (starts background prep) */
export async function analyzeVideo(req: Request, res: Response) {
  const videoId = extractVideoId(req.body?.url);
  if (!videoId) {
    throw new HttpError(400, "That doesn't look like a YouTube video link. Try something like https://youtu.be/VIDEO_ID");
  }
  const video = await getVideoInfo(videoId);
  ensurePrepared(videoId);
  res.json({ success: true, data: { video, status: await getPrepStatus(videoId) } });
}

/** GET /api/videos/:videoId */
export async function getVideo(req: Request, res: Response) {
  const videoId = videoIdParam(req);
  const video = await getVideoInfo(videoId);
  ensurePrepared(videoId);
  res.json({ success: true, data: { video, status: await getPrepStatus(videoId) } });
}

/** GET /api/videos/:videoId/status */
export async function getStatus(req: Request, res: Response) {
  res.json({ success: true, data: await getPrepStatus(videoIdParam(req)) });
}

/** GET /api/videos/:videoId/transcript */
export async function getTranscript(req: Request, res: Response) {
  const data = await getTranscriptData(videoIdParam(req));
  if (!data) throw new HttpError(404, 'The transcript is not ready yet.');
  res.json({ success: true, data });
}

/** GET /api/videos/:videoId/subtitles.srt?lang=en|original */
export async function getSubtitles(req: Request, res: Response) {
  const videoId = videoIdParam(req);
  const data = await getTranscriptData(videoId);
  if (!data) throw new HttpError(404, 'The transcript is not ready yet.');
  const useOriginal = req.query.lang === 'original' && data.original;
  const segments = useOriginal ? data.original! : data.segments;
  const lang = useOriginal ? data.meta.originalLanguageCode || 'orig' : data.meta.languageCode;
  res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${videoId}.${lang}.srt"`);
  res.send(toSrt(segments));
}

/** GET /api/videos/:videoId/summary?refresh=1 */
export async function getVideoSummary(req: Request, res: Response) {
  const summary = await getSummary(videoIdParam(req), req.query.refresh === '1');
  res.json({ success: true, data: summary });
}
