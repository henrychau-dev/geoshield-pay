import { execFile } from "node:child_process";

/** Run a binary without a shell, streaming nothing, resolving stdout/stderr. */
export function run(bin, args, { cwd, timeoutMs = 15 * 60 * 1000, env } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { cwd, timeout: timeoutMs, env: { ...process.env, ...env }, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          const hint = stderr ? `\n${stderr.slice(-2000)}` : "";
          reject(new Error(`${bin} ${args.slice(0, 6).join(" ")} failed: ${err.message}${hint}`));
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

export function ffmpeg(args, opts = {}) {
  return run("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...args], opts);
}

export async function probeDuration(file, opts = {}) {
  const { stdout } = await run(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    opts
  );
  const value = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(value)) throw new Error(`Could not read duration of ${file}`);
  return value;
}

export async function probeStreams(file, opts = {}) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], opts);
  return JSON.parse(stdout);
}
