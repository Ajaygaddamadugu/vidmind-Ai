import { Request, Response } from 'express';
import { HttpError } from '../utils/httpError';
import { extractInstagramId, isInstagramId } from '../utils/instagram';
import { getInstagramInfo } from '../services/instagram.service';

/** POST /api/instagram  { url } → reel metadata + download options */
export async function analyzeReel(req: Request, res: Response) {
  const code = extractInstagramId(req.body?.url);
  if (!code) {
    throw new HttpError(400, "That doesn't look like an Instagram reel or video link. Try something like https://www.instagram.com/reel/ABC123/");
  }
  res.json({ success: true, data: { video: await getInstagramInfo(code) } });
}

/** GET /api/instagram/:code */
export async function getReel(req: Request, res: Response) {
  const code = req.params.code;
  if (!isInstagramId(code)) throw new HttpError(400, 'Invalid Instagram link.');
  res.json({ success: true, data: { video: await getInstagramInfo(code) } });
}
