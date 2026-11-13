import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { env } from '../config/env';

export interface PythonResult {
  stdout: string;
  stderr: string;
}

/**
 * Runs the configured Python interpreter with the given args (no shell).
 */
export function runPython(
  args: string[],
  timeoutMs = 120_000,
  maxBufferMb = 50,
  extraEnv: Record<string, string> = {}
): Promise<PythonResult> {
  return new Promise((resolve, reject) => {
    execFile(
      env.PYTHON_BIN,
      args,
      { maxBuffer: maxBufferMb * 1024 * 1024, timeout: timeoutMs, windowsHide: true, env: { ...process.env, ...extraEnv } },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as NodeJS.ErrnoException & { killed?: boolean };
          const detail = err.code === 'ENOENT' ? `ENOENT: python not found (${env.PYTHON_BIN})` : stderr || err.message;
          return reject(Object.assign(new Error(detail), { stderr: detail, timedOut: !!err.killed }));
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

const cookieCopies = new Map<string, string>();

/**
 * yt-dlp writes cookies back to the file when it exits, but secret-file mounts (e.g. Render's
 * /etc/secrets) are read-only. Work on a private writable copy, made once per process.
 */
export function usableCookiesFile(file: string): string {
  if (!file) return '';
  const known = cookieCopies.get(file);
  if (known !== undefined) return known;
  let copy = '';
  try {
    copy = path.join(os.tmpdir(), `vidmind_cookies_${cookieCopies.size}_${path.basename(file)}`);
    fs.copyFileSync(file, copy);
  } catch (err) {
    console.warn(`[cookies] could not read ${file}, continuing without cookies:`, (err as Error).message);
    copy = '';
  }
  cookieCopies.set(file, copy);
  return copy;
}

/** Common yt-dlp flags we always want. Defaults are YouTube's cookies and proxy. */
export function ytdlpBaseArgs(opts: { cookiesFile?: string; proxy?: string } = {}): string[] {
  const cookiesFile = usableCookiesFile(opts.cookiesFile ?? env.YTDLP_COOKIES_FILE);
  const proxy = opts.proxy ?? env.YOUTUBE_PROXY_URL;
  const args = ['-m', 'yt_dlp', '--no-warnings', '--no-cache-dir', '--no-playlist'];
  // YouTube needs a JS runtime to solve its player challenges; without one most formats go missing.
  if (env.YTDLP_JS_RUNTIME) args.push('--js-runtimes', env.YTDLP_JS_RUNTIME);
  if (cookiesFile) args.push('--cookies', cookiesFile);
  if (proxy) args.push('--proxy', proxy);
  return args;
}
