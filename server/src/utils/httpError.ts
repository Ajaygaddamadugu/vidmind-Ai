export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Instagram-specific failures first, then the shared yt-dlp messages. */
export function friendlyInstagramError(raw: string): HttpError {
  const text = raw.toLowerCase();
  if (
    text.includes('empty media response') ||
    text.includes('login required') ||
    text.includes('requested content is not available') ||
    text.includes('rate-limit') ||
    text.includes('use --cookies')
  ) {
    return new HttpError(
      403,
      "Instagram didn't share this post with us. It may be private, removed, or Instagram is limiting downloads right now. Please try again later.",
      'IG_LOGIN'
    );
  }
  if (text.includes('no video formats') || text.includes('there is no video in this post')) {
    return new HttpError(400, 'This post has no video. Only reels and video posts can be downloaded.', 'IG_NO_VIDEO');
  }
  return friendlyYoutubeError(raw, 'Instagram');
}

/**
 * Turns noisy yt-dlp / Python stderr into a message a user can act on.
 */
export function friendlyYoutubeError(raw: string, platform = 'YouTube'): HttpError {
  const text = raw.toLowerCase();
  if (text.includes('sign in to confirm') || text.includes('not a bot') || text.includes('http error 429') || text.includes('too many requests')) {
    return new HttpError(503, `${platform} is temporarily blocking requests from this server. Please try again in a few minutes.`, 'YT_BLOCKED');
  }
  if (text.includes('private video')) {
    return new HttpError(400, 'This video is private, so it cannot be processed.', 'PRIVATE');
  }
  if (text.includes('age') && (text.includes('restricted') || text.includes('confirm your age'))) {
    return new HttpError(400, 'This video is age-restricted, so it cannot be processed.', 'AGE_RESTRICTED');
  }
  if (text.includes('members-only') || text.includes('join this channel')) {
    return new HttpError(400, 'This video is for channel members only.', 'MEMBERS_ONLY');
  }
  if (text.includes('premiere') || text.includes('live event will begin')) {
    return new HttpError(400, 'This video has not been released yet.', 'NOT_RELEASED');
  }
  if (text.includes('http error 403') || text.includes('forbidden')) {
    return new HttpError(502, `${platform} refused to send this stream. Please try again or pick a different quality.`, 'YT_FORBIDDEN');
  }
  if (text.includes('requested format is not available')) {
    return new HttpError(400, 'That quality is no longer available for this video. Please pick another one.', 'FORMAT_GONE');
  }
  if (/video (is )?unavailable|not available|been removed|does not exist/.test(text)) {
    return new HttpError(404, 'This video is unavailable. It may have been removed or blocked in this region.', 'UNAVAILABLE');
  }
  if (text.includes('enoent') || text.includes('no module named')) {
    return new HttpError(500, 'Server is missing yt-dlp. Install it with: pip install -r server/requirements.txt', 'SETUP');
  }
  return new HttpError(502, `Could not reach ${platform} for this video. Please try again.`, 'YT_ERROR');
}
