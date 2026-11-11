import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const LOG_DIR = path.resolve("demo/.cache");

export async function isServerUp(baseUrl, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/paypal/config`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForServer(baseUrl, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isServerUp(baseUrl)) return true;
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error(`Server at ${baseUrl} did not become healthy in ${timeoutMs}ms`);
}

/**
 * Start `next start` on the given port unless something already answers there.
 * Returns { owned, stop } so the orchestrator only kills what it started.
 */
export async function ensureServer({ baseUrl, port, cwd = process.cwd() }) {
  if (await isServerUp(baseUrl)) {
    console.log(`  using already running server at ${baseUrl}`);
    return { owned: false, stop: async () => {} };
  }

  await fs.mkdir(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `server-${port}.log`);
  const out = await fs.open(logFile, "w");

  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", `npx next start -p ${port}`], {
          cwd,
          detached: false,
          windowsHide: true,
          stdio: ["ignore", out.handle, out.handle],
        })
      : spawn("npx", ["next", "start", "-p", String(port)], {
          cwd,
          detached: false,
          stdio: ["ignore", out.handle, out.handle],
        });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.warn(`  server exited with code ${code} (see ${path.relative(cwd, logFile)})`);
  });

  await waitForServer(baseUrl);
  console.log(`  started server on ${baseUrl} (pid ${child.pid})`);

  return {
    owned: true,
    stop: async () => {
      await new Promise((resolve) => {
        if (process.platform === "win32") {
          spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).on("exit", resolve);
        } else {
          child.kill("SIGTERM");
          resolve();
        }
      });
      await out.close().catch(() => {});
    },
  };
}
