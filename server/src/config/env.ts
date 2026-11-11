import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env in the server root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const serverRoot = path.resolve(__dirname, '../../');

function int(name: string, fallback: number): number {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: int('PORT', 5000),

  NVIDIA_API_KEY: process.env.NVIDIA_API_KEY || '',
  NVIDIA_LLM_MODEL: process.env.NVIDIA_LLM_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b',
  NVIDIA_TRANSLATE_MODEL:
    process.env.NVIDIA_TRANSLATE_MODEL || process.env.NVIDIA_LLM_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b',
  NVIDIA_EMBEDDING_MODEL: process.env.NVIDIA_EMBEDDING_MODEL || 'nvidia/nemotron-3.5-embed-1b',
  // Reasoning models (e.g. Nemotron) "think" before answering — slow and unnecessary here.
  NVIDIA_DISABLE_THINKING: process.env.NVIDIA_DISABLE_THINKING !== 'false',

  DOWNLOAD_DIR: path.resolve(serverRoot, process.env.DOWNLOAD_DIR || 'downloads'),
  DATABASE_URL: path.resolve(serverRoot, process.env.DATABASE_URL || 'db/vidmind.sqlite'),
  CLIENT_DIST_DIR: path.resolve(serverRoot, process.env.CLIENT_DIST_DIR || '../client/dist'),

  PYTHON_BIN: process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3'),
  YTDLP_COOKIES_FILE: process.env.YTDLP_COOKIES_FILE || '',

  CORS_ORIGIN: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',

  RATE_LIMIT_PER_MINUTE: int('RATE_LIMIT_PER_MINUTE', 60),
  MAX_CONCURRENT_DOWNLOADS: int('MAX_CONCURRENT_DOWNLOADS', 3),
  MAX_VIDEO_DURATION_SECONDS: int('MAX_VIDEO_DURATION_SECONDS', 9000), // 2.5 hours
  DOWNLOAD_FILE_TTL_MINUTES: int('DOWNLOAD_FILE_TTL_MINUTES', 30),
};

export const isProduction = env.NODE_ENV === 'production';
