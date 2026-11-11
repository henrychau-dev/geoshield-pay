import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { SCENES, TAIL_SECONDS, NARRATION_LEAD_SECONDS } from "./scenes.mjs";
import { installCursor, clickHuman, moveTo } from "./lib/cursor.mjs";
import { waitForServer } from "./preflight.mjs";

const CACHE = path.resolve("demo/.cache");
const FRAMES_DIR = path.join(CACHE, "frames");
const TAKE_FILE = path.join(CACHE, "take.json");
const TIMING_FILE = path.join(CACHE, "timing.json");
const BASE = process.env.BASE_URL || "http://localhost:3210";
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const DRY = process.argv.includes("--dry");

/** Element locators keyed by scene action verbs. */
function button(page, { name, exact = true }) {
  return page.getByRole("button", { name, exact }).first();
}

function link(page, { name, exact = true }) {
  return page.getByRole("link", { name, exact }).first();
}

async function smoothScroll(page, dy) {
  await page.evaluate(async (delta) => {
    const start = window.scrollY;
    const target = Math.max(0, start + delta);
    const distance = target - start;
    const duration = Math.min(1500, Math.max(380, Math.abs(distance) * 0.9));
    const t0 = performance.now();
    await new Promise((resolve) => {
      function frame(now) {
        const p = Math.min(1, (now - t0) / duration);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        window.scrollTo(0, start + distance * eased);
        if (p < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }, dy);
  await page.waitForTimeout(220);
}

async function assertVisibleText(page, text, timeoutMs = 8000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: timeoutMs });
}

async function readOrders() {
  const res = await fetch(`${BASE}/api/orders`);
  if (!res.ok) throw new Error(`/api/orders -> HTTP ${res.status}`);
  return (await res.json()).orders;
}

export async function recordTake({ dry = DRY } = {}) {
  await waitForServer();
  const timing = JSON.parse(await fs.readFile(TIMING_FILE, "utf8"));
  const narr = new Map(timing.scenes.map((s) => [s.id, s.seconds]));

  // Frames are overwritten in place; leftovers from longer takes are simply never
  // referenced by take.json, so there is nothing to bulk-delete here.
  await fs.mkdir(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome", headless: true, executablePath: CHROME, args: ["--hide-scrollbars"] });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await installCursor(page);

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // Warm the routes so the first recorded second is never blank.
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForTimeout(500);

  const frames = [];
  let client = null;
  let wallZero = 0;
  let firstFrameTs = null;
  let firstFrameWall = null;
  const pendingWrites = [];

  if (!dry) {
    client = await context.newCDPSession(page);
    await client.send("Page.enable");

    client.on("Page.screencastFrame", (event) => {
      const { data, metadata, sessionId } = event;
      const wall = Date.now() / 1000;
      if (firstFrameTs === null) {
        firstFrameTs = metadata.timestamp;
        firstFrameWall = wall;
      }
      const index = frames.length;
      const file = `f_${String(index).padStart(5, "0")}.jpg`;
      const t = metadata.timestamp - firstFrameTs + Math.max(0, (firstFrameWall ?? wall) - wallZero);
      frames.push({ file, t });
      pendingWrites.push(fs.writeFile(path.join(FRAMES_DIR, file), Buffer.from(data, "base64")));
      client.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });

    await client.send("Page.startScreencast", {
      format: "jpeg",
      quality: 90,
      maxWidth: 1920,
      maxHeight: 1080,
      everyNthFrame: 1,
    });
  }

  wallZero = Date.now() / 1000;
  const now = () => Date.now() / 1000 - wallZero;
  const sleepUntil = async (t) => {
    const remaining = t - now();
    if (remaining > 0) await page.waitForTimeout(Math.round(remaining * 1000));
  };

  const ctx = { freshBlocked: null, freshBlockedAt: null };
  const boundaries = [];
  const stepLog = [];

  async function runAction(scene, action) {
    const t0 = now();
    switch (action.kind) {
      case "goto":
        await page.goto(`${BASE}${action.path}`, { waitUntil: "load" });
        await page.waitForTimeout(350);
        break;
      case "click": {
        const locator = action.role === "link" ? link(page, action) : button(page, action);
        await clickHuman(page, locator);
        break;
      }
      case "clickChip": {
        const section = page.locator("section", { has: page.getByRole("heading", { name: action.section }) }).first();
        await clickHuman(page, section.getByRole("button", { name: action.name, exact: true }).first());
        break;
      }
      case "clickOrderCard": {
        const card = page.locator('a[href^="/dashboard/orders/"]').filter({ hasText: action.reference }).first();
        await clickHuman(page, card);
        break;
      }
      case "hover": {
        const locator = action.role === "link" ? link(page, action) : button(page, action);
        await moveTo(page, locator);
        break;
      }
      case "scroll":
        await smoothScroll(page, action.dy);
        break;
      case "wait":
        await page.waitForTimeout(action.ms);
        break;
      case "assertText":
        await assertVisibleText(page, action.text, action.timeoutMs ?? 8000);
        break;
      case "snapshotBlocked": {
        const orders = await readOrders();
        const blocked = orders
          .filter((o) => o.decision === "BLOCK" && o.status === "BLOCKED")
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        if (!blocked) throw new Error("No blocked order found right after the interception");
        if (new Date(blocked.createdAt).getTime() / 1000 < wallZero - 5) {
          throw new Error(`Newest blocked order ${blocked.reference} is stale — the precheck did not persist a new order`);
        }
        ctx.freshBlocked = blocked.reference;
        ctx.freshBlockedAt = blocked.createdAt;
        console.log(`    new interception persisted: ${blocked.reference}`);
        break;
      }
      case "assertFreshOrder": {
        if (!ctx.freshBlocked) throw new Error("assertFreshOrder ran before snapshotBlocked");
        await assertVisibleText(page, ctx.freshBlocked, 12000);
        break;
      }
      case "rerunAnalyst": {
        const t = now();
        await clickHuman(page, page.getByRole("button", { name: "Re-run", exact: true }).first());
        await page.getByText(`LLM: ${action.expectModel}`, { exact: false }).first().waitFor({ state: "visible", timeout: 40_000 });
        console.log(`    live AI report ready in ${(now() - t).toFixed(1)}s (model ${action.expectModel})`);
        break;
      }
      case "saveRules": {
        await clickHuman(page, page.getByRole("button", { name: "Save & hot-reload", exact: true }).first());
        await assertVisibleText(page, action.expectBadge, 8000);
        break;
      }
      default:
        throw new Error(`Unknown action kind: ${action.kind}`);
    }
    const spent = now() - t0;
    stepLog.push({ scene: scene.id, kind: action.kind, spent: Number(spent.toFixed(2)) });
    if (spent > 8) console.log(`    ! ${scene.id}/${action.kind} took ${spent.toFixed(1)}s`);
  }

  try {
    for (const scene of SCENES) {
      const start = now();
      console.log(`  scene ${scene.id} @ ${start.toFixed(1)}s`);
      for (const action of scene.actions) await runAction(scene, action);

      const narration = narr.get(scene.id) ?? 0;
      const minEnd = start + NARRATION_LEAD_SECONDS + narration + 0.45;
      await sleepUntil(Math.max(minEnd, start + scene.minSeconds));
      const end = now();
      boundaries.push({ id: scene.id, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) });
      console.log(`  scene ${scene.id} done @ ${end.toFixed(1)}s (${(end - start).toFixed(1)}s, narration ${narration.toFixed(1)}s)`);
    }

    await page.waitForTimeout(Math.round(TAIL_SECONDS * 1000));
  } catch (err) {
    await page.screenshot({ path: path.join(CACHE, `failure-${Date.now()}.png`) }).catch(() => {});
    throw err;
  } finally {
    if (client) {
      await client.send("Page.stopScreencast").catch(() => {});
    }
    await browser.close();
    await Promise.allSettled(pendingWrites);
  }

  const totalSeconds = boundaries[boundaries.length - 1].end + TAIL_SECONDS;
  const take = {
    baseUrl: BASE,
    dry,
    recordedAt: new Date().toISOString(),
    totalSeconds: Number(totalSeconds.toFixed(3)),
    scenes: boundaries,
    steps: stepLog,
    freshBlocked: ctx.freshBlocked,
    frames: frames.map((f) => ({ file: f.file, t: Number(f.t.toFixed(3)) })),
    consoleErrors,
  };
  await fs.writeFile(TAKE_FILE, JSON.stringify(take, null, 2), "utf8");

  console.log(`  take length ${totalSeconds.toFixed(1)}s, ${frames.length} frames`);
  if (consoleErrors.length) console.log(`  console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
  return take;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  recordTake().catch((err) => {
    console.error(`take failed: ${err.message}`);
    process.exit(1);
  });
}
