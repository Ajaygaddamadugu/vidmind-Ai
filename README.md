# VidMind AI

Paste a YouTube link and get:

- **Downloads**: MP4 from 240p up to 4K, or MP3. You can include English subtitles (plus the original language) as tracks inside the file.
- **An English transcript from any language**: real English captions are used first. If there are none, YouTube's own translation is tried, and if that isn't available, the captions are translated with AI. Every timestamp is kept.
- **A summary**: key takeaways and chapters you can click to jump the player.
- **Chat with the video**: answers stream in, are grounded in the transcript, and include clickable timestamps and sources.
- **Instagram reels**: switch to the Instagram tab (or just paste a reel link) to download public reels and video posts as MP4 or MP3. Instagram is download-only.

The stack is React + Vite + Tailwind for the client and Express + SQLite for the server, with yt-dlp, youtube-transcript-api, ffmpeg and NVIDIA NIM for the AI features.

## Run locally

Requirements: Node 20.19+ and Python 3.10+.

```bash
npm run install:all                         # Node dependencies (root, server, client)
pip install -r server/requirements.txt      # yt-dlp + youtube-transcript-api
cp server/.env.example server/.env          # then put your NVIDIA_API_KEY in it
npm run dev                                 # API on :5000, app on http://localhost:5173
```

## Deploy (Docker)

The image serves both the API and the built app from a single port.

```bash
docker build -t vidmind .
docker run -p 8080:8080 -e NVIDIA_API_KEY=... -v vidmind-db:/app/server/db vidmind
```

On Railway, Render, Fly.io or a VPS:

- Deploy from the Dockerfile and set `NVIDIA_API_KEY`.
- Attach a **persistent volume** at `/app/server/db`.
- Run **one instance**. Download jobs and rate limits are kept in memory.
- Set `CORS_ORIGIN` to your domain if the frontend is hosted elsewhere. When the app and API share an origin, CORS isn't involved.
- **Rebuild regularly (weekly)** so yt-dlp stays current. YouTube changes break old versions.

Serverless hosts (Vercel or Netlify functions) won't work: the server needs long-running processes and local disk.

## Configuration (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `NVIDIA_API_KEY` | – | Required for summary, chat and translation |
| `NVIDIA_LLM_MODEL` | `nvidia/nemotron-3.5-lightning-30b-a3b` | Must be a model your key can use (`GET https://integrate.api.nvidia.com/v1/models`) |
| `NVIDIA_EMBEDDING_MODEL` | `nvidia/nemotron-3.5-embed-1b` | Changing it triggers a rebuild of the stored embeddings |
| `NVIDIA_TRANSLATE_MODEL` | same as LLM | Optional separate model for translation |
| `CORS_ORIGIN` | `*` | Comma-separated list of allowed origins |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per-IP budget for API calls (status polling isn't counted) |
| `MAX_CONCURRENT_DOWNLOADS` | `3` | Extra downloads wait in a queue |
| `MAX_VIDEO_DURATION_SECONDS` | `9000` | 2.5 hours |
| `DOWNLOAD_FILE_TTL_MINUTES` | `30` | Finished files are deleted after this |
| `YTDLP_COOKIES_FILE` | – | Path to a YouTube cookies.txt, for when YouTube blocks the server's IP. Used for downloads and transcripts. Read-only paths (e.g. Render's `/etc/secrets/…`) are fine |
| `YOUTUBE_PROXY_URL` | – | Proxy for YouTube requests (`http://user:pass@host:port`), if cookies aren't enough |
| `YTDLP_JS_RUNTIME` | `node` | JS runtime yt-dlp uses for YouTube's player challenges. Without one, most formats are missing |
| `INSTAGRAM_COOKIES_FILE` | – | cookies.txt from a logged-in Instagram session. Instagram often blocks anonymous requests from cloud servers |
| `PYTHON_BIN` | `python` / `python3` | Python that has the requirements installed |

## Troubleshooting

- **Downloads fail with "YouTube refused to send this stream"**: update yt-dlp with `pip install -U yt-dlp`, or rebuild the image.
- **"YouTube is temporarily blocking requests from this server"** (logs show `Failed to extract any player response` or `Sign in to confirm you're not a bot`): this is common on cloud IPs. Set `YTDLP_COOKIES_FILE` (export from a spare Google account), or set `YOUTUBE_PROXY_URL` to a residential proxy.
- **Instagram says "didn't share this post with us"**: the post is private, or Instagram is limiting anonymous requests from your server. Set `INSTAGRAM_COOKIES_FILE` (use a spare account).
- **"The configured AI model … is not available"**: NVIDIA retired the model. Pick a current one from the `/v1/models` list.
