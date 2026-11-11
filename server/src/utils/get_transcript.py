"""
Fetches a YouTube transcript and always tries to return an English version.

Strategy:
  1. A real English track (human-made preferred over auto-generated).
  2. Otherwise the original-language track, translated to English by YouTube.
  3. Otherwise the original-language track as-is (not translatable).

The original-language segments are also returned when a translation was used,
so the UI can offer an "Original / English" toggle.

Output (stdout, single JSON line):
  { success, transcript, language, languageCode, translated, isGenerated,
    original: { language, languageCode, transcript } | null }
"""
import sys
import json

from youtube_transcript_api import YouTubeTranscriptApi

ENGLISH_CODES = ['en', 'en-US', 'en-GB', 'en-IN', 'en-CA', 'en-AU']


def to_segments(fetched):
    return [
        {"text": s["text"], "start": float(s["start"]), "duration": float(s.get("duration", 0))}
        for s in fetched.to_raw_data()
        if s.get("text", "").strip()
    ]


def pick_original(transcript_list):
    """Prefer a human-made track, then any auto-generated one."""
    tracks = list(transcript_list)
    manual = [t for t in tracks if not t.is_generated]
    return (manual or tracks)[0] if tracks else None


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No video ID provided"}))
        return

    video_id = sys.argv[1]
    try:
        transcript_list = YouTubeTranscriptApi().list(video_id)

        # 1. Native English
        english = None
        try:
            english = transcript_list.find_transcript(ENGLISH_CODES)
        except Exception:
            english = None

        if english is not None:
            print(json.dumps({
                "success": True,
                "transcript": to_segments(english.fetch()),
                "language": english.language,
                "languageCode": english.language_code,
                "translated": False,
                "isGenerated": english.is_generated,
                "original": None,
            }))
            return

        original = pick_original(transcript_list)
        if original is None:
            print(json.dumps({"success": False, "error": "This video has no captions."}))
            return

        original_segments = to_segments(original.fetch())
        original_info = {
            "language": original.language,
            "languageCode": original.language_code,
            "transcript": original_segments,
        }

        # 2. Translate to English via YouTube
        if original.is_translatable:
            try:
                translated = original.translate('en')
                print(json.dumps({
                    "success": True,
                    "transcript": to_segments(translated.fetch()),
                    "language": "English",
                    "languageCode": "en",
                    "translated": True,
                    "isGenerated": original.is_generated,
                    "original": original_info,
                }))
                return
            except Exception:
                pass  # fall through to the untranslated original

        # 3. Original language only
        print(json.dumps({
            "success": True,
            "transcript": original_segments,
            "language": original.language,
            "languageCode": original.language_code,
            "translated": False,
            "isGenerated": original.is_generated,
            "original": None,
        }))
    except Exception as e:
        name = type(e).__name__
        if name in ("TranscriptsDisabled", "NoTranscriptFound"):
            message = "This video has no captions."
        elif name == "VideoUnavailable":
            message = "This video is unavailable."
        elif name in ("RequestBlocked", "IpBlocked"):
            message = "YouTube is temporarily blocking caption requests from this server."
        else:
            message = f"{name}: {str(e).splitlines()[0] if str(e) else 'unknown error'}"
        print(json.dumps({"success": False, "error": message}))


if __name__ == '__main__':
    main()
