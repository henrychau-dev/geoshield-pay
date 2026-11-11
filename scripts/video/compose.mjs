import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ffmpeg, probeStreams } from "./lib/ffmpeg.mjs";
import { NARRATION_LEAD_SECONDS } from "./scenes.mjs";

const CACHE = path.resolve("demo/.cache");
const TAKE_FILE = path.join(CACHE, "take.json");
const TIMING_FILE = path.join(CACHE, "timing.json");
const OUT_DIR = path.resolve("demo");
const FPS = 30;

function assTime(seconds) {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

function wrap(text, maxChars = 46) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if ((current + " " + word).length <= maxChars) current += " " + word;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Turns narration into 1-2 line caption cues, timed proportionally to their length. */
function buildCues(scenes, timingScenes) {
  const cues = [];
  for (const scene of scenes) {
    const audio = timingScenes.find((t) => t.id === scene.id);
    if (!audio) continue;
    const start = scene.start + NARRATION_LEAD_SECONDS;
    const duration = audio.seconds;
    const sentences = audio.text.split(/(?<=[.!?—])\s+/).filter(Boolean);

    const blocks = [];
    let block = "";
    for (const sentence of sentences) {
      const candidate = block ? `${block} ${sentence}` : sentence;
      if (candidate.length > 96 && block) {
        blocks.push(block);
        block = sentence;
      } else {
        block = candidate;
      }
    }
    if (block) blocks.push(block);

    const totalChars = blocks.reduce((sum, b) => sum + b.length, 0);
    let cursor = start;
    for (const text of blocks) {
      const share = (text.length / totalChars) * duration;
      const end = Math.min(start + duration, cursor + share);
      cues.push({ start: cursor, end, text: wrap(text).join("\\N") });
      cursor = end;
    }
  }
  return cues;
}

function assDocument(cues) {
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1920",
    "PlayResY: 1080",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Arial,44,&H00FFFFFF,&H000000FF,&H00101010,&H8C000000,-1,0,0,0,100,100,0,0,1,3,1,2,140,140,52,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = cues.map(
    (c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${c.text}`
  );
  return `${header.concat(events).join("\n")}\n`;
}

async function writeFramesList(frames, totalSeconds) {
  const lines = [];
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const next = frames[i + 1];
    const duration = next ? Math.max(0.01, next.t - frame.t) : Math.max(0.01, totalSeconds - frame.t);
    lines.push(`file 'frames/${frame.file}'`);
    lines.push(`duration ${duration.toFixed(4)}`);
  }
  // The concat demuxer wants the last file repeated so its duration is honoured.
  if (frames.length) lines.push(`file 'frames/${frames[frames.length - 1].file}'`);
  await fs.writeFile(path.join(CACHE, "frames.txt"), `${lines.join("\n")}\n`, "utf8");
}

async function buildAudioTrack(take, timing, totalSeconds) {
  const inputs = [];
  const filters = [];
  const mixed = [];

  take.scenes.forEach((scene, index) => {
    const audio = timing.scenes.find((t) => t.id === scene.id);
    if (!audio) throw new Error(`No narration for scene ${scene.id}`);
    const wav = path.join(CACHE, audio.audio);
    inputs.push("-i", wav);
    const delayMs = Math.round((scene.start + NARRATION_LEAD_SECONDS) * 1000);
    filters.push(`[${index}:a]adelay=${delayMs}:all=1,apad,atrim=0:${totalSeconds}[a${index}]`);
    mixed.push(`[a${index}]`);
  });

  filters.push(
    `${mixed.join("")}amix=inputs=${take.scenes.length}:normalize=0:duration=longest,` +
      `loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,atrim=0:${totalSeconds}[aout]`
  );

  const out = path.join(CACHE, "narration.wav");
  await ffmpeg([...inputs, "-filter_complex", filters.join(";"), "-map", "[aout]", "-ar", "48000", "-ac", "1", out], {
    cwd: CACHE,
  });
  return out;
}

export async function composeVideo() {
  const take = JSON.parse(await fs.readFile(TAKE_FILE, "utf8"));
  const timing = JSON.parse(await fs.readFile(TIMING_FILE, "utf8"));
  if (!take.frames?.length) throw new Error("No frames recorded — run record.mjs without --dry first");
  if (take.dry) throw new Error("take.json came from a dry run — record a real take first");

  const totalSeconds = take.totalSeconds;
  await writeFramesList(take.frames, totalSeconds);

  const cues = buildCues(take.scenes, timing.scenes);
  const ass = assDocument(cues);
  await fs.writeFile(path.join(CACHE, "captions.ass"), ass, "utf8");
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, "captions.ass"), ass, "utf8");

  const audio = await buildAudioTrack(take, timing, totalSeconds);
  const output = path.join(OUT_DIR, "geoshield-demo-1080p.mp4");

  await ffmpeg(
    [
      "-f", "concat", "-safe", "0", "-i", "frames.txt",
      "-i", path.basename(audio),
      "-vf", "ass=captions.ass",
      "-vsync", "cfr",
      "-r", String(FPS),
      "-c:v", "libx264",
      "-crf", "18",
      "-preset", "slow",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      "-shortest",
      path.relative(CACHE, output),
    ],
    { cwd: CACHE, timeoutMs: 45 * 60 * 1000 }
  );

  const probe = await probeStreams(output);
  const video = probe.streams.find((s) => s.codec_type === "video");
  const audioStream = probe.streams.find((s) => s.codec_type === "audio");
  console.log(
    `  composed ${path.relative(process.cwd(), output)} — ${Number(probe.format.duration).toFixed(1)}s, ` +
      `${video.width}x${video.height} @ ${video.r_frame_rate}, ${audioStream?.codec_name ?? "no audio"}`
  );
  return { output, duration: Number(probe.format.duration), video, audioStream, cues: cues.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  composeVideo().catch((err) => {
    console.error(`compose failed: ${err.message}`);
    process.exit(1);
  });
}
