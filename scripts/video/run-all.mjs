import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./lib/ffmpeg.mjs";
import { ensureServer } from "./lib/server.mjs";
import { runPreflight } from "./preflight.mjs";
import { buildNarration } from "./tts.mjs";
import { recordTake } from "./record.mjs";
import { composeVideo } from "./compose.mjs";

const PORT = Number(process.env.PORT || 3210);
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const MAX_TAKES = Number(process.env.MAX_TAKES || 3);
const SKIP_TTS = process.argv.includes("--skip-tts");
const SKIP_REHEARSAL = process.argv.includes("--skip-rehearsal");

async function npm(script) {
  console.log(`\n> npm run ${script}`);
  // Node refuses to spawn .cmd shims without a shell, so go through cmd.exe explicitly.
  const { stdout } = await run(
    process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32" ? ["/d", "/s", "/c", `npm run --silent ${script}`] : ["run", "--silent", script],
    { cwd: process.cwd() }
  );
  const tail = stdout.trim().split(/\r?\n/).slice(-2).join(" | ");
  if (tail) console.log(`  ${tail}`);
}

async function main() {
  const server = await ensureServer({ baseUrl: BASE, port: PORT });

  try {
    await npm("db:seed");
    console.log("\n> preflight");
    await runPreflight();

    await npm("db:seed");

    if (!SKIP_TTS) {
      console.log("\n> narration");
      await buildNarration();
    }

    if (!SKIP_REHEARSAL) {
      console.log("\n> rehearsal (no recording)");
      await recordTake({ dry: true });
      await npm("db:seed");
    }

    let take = null;
    for (let attempt = 1; attempt <= MAX_TAKES; attempt += 1) {
      console.log(`\n> take ${attempt}/${MAX_TAKES}`);
      await npm("db:seed");
      try {
        take = await recordTake({ dry: false });
        break;
      } catch (err) {
        console.error(`  take ${attempt} failed: ${err.message}`);
        if (attempt === MAX_TAKES) throw new Error("All takes failed — not producing a compromised video");
        console.log("  re-seeding and retaking the whole shot…");
      }
    }

    console.log("\n> compose");
    const result = await composeVideo();

    if (result.duration < 90 || result.duration > 125) {
      throw new Error(`Final video is ${result.duration.toFixed(1)}s — outside the 90–120s target`);
    }

    console.log(`\nDONE: ${path.relative(process.cwd(), result.output)} (${result.duration.toFixed(1)}s, ${take.frames.length} raw frames)`);
  } finally {
    await server.stop();
    await npm("db:seed");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
