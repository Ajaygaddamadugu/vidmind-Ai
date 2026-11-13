import { execFile } from 'child_process';
import { env } from '../config/env';

export interface PythonResult {
  stdout: string;
  stderr: string;
}

/**
 * Runs the configured Python interpreter with the given args (no shell).
 */
export function runPython(args: string[], timeoutMs = 120_000, maxBufferMb = 50): Promise<PythonResult> {
  return new Promise((resolve, reject) => {
    execFile(
      env.PYTHON_BIN,
      args,
      { maxBuffer: maxBufferMb * 1024 * 1024, timeout: timeoutMs, windowsHide: true },
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

/** Common yt-dlp flags we always want. */
export function ytdlpBaseArgs(): string[] {
  const args = ['-m', 'yt_dlp', '--no-warnings', '--no-cache-dir', '--no-playlist'];
  // YouTube needs a JS runtime to solve its player challenges; without one most formats go missing.
  if (env.YTDLP_JS_RUNTIME) args.push('--js-runtimes', env.YTDLP_JS_RUNTIME);
  if (env.YTDLP_COOKIES_FILE) args.push('--cookies', env.YTDLP_COOKIES_FILE);
  return args;
}
