import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENES } from "./scenes.mjs";
import { ffmpeg, probeDuration, run } from "./lib/ffmpeg.mjs";

const CACHE = path.resolve("demo/.cache");
const AUDIO_DIR = path.join(CACHE, "audio");
const TIMING_FILE = path.join(CACHE, "timing.json");

const VOICE = process.env.TTS_VOICE || "en-US-AriaNeural";
const RATE = process.env.TTS_RATE || "+4%";

async function synthEdge(text, outMp3) {
  await run("python", ["-m", "edge_tts", "--voice", VOICE, `--rate=${RATE}`, "--text", text, "--write-media", outMp3], {
    timeoutMs: 120_000,
  });
}

async function synthSapi(text, outWav) {
  const txt = path.join(AUDIO_DIR, "sapi-input.txt");
  const ps1 = path.join(AUDIO_DIR, "sapi.ps1");
  await fs.writeFile(txt, text, "utf8");
  await fs.writeFile(
    ps1,
    [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      "$s.SelectVoice('Microsoft Zira Desktop')",
      "$s.Rate = 1",
      `$s.SetOutputToWaveFile('${outWav.replace(/\\/g, "\\\\")}')`,
      `$s.Speak([System.IO.File]::ReadAllText('${txt.replace(/\\/g, "\\\\")}'))`,
      "$s.Dispose()",
    ].join("\r\n"),
    "utf8"
  );
  await run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1], { timeoutMs: 120_000 });
}

async function synthesizeScene(scene) {
  const mp3 = path.join(AUDIO_DIR, `${scene.id}.mp3`);
  const wav = path.join(AUDIO_DIR, `${scene.id}.wav`);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await synthEdge(scene.narration, mp3);
      await ffmpeg(["-i", mp3, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
      return { engine: `edge-tts:${VOICE}`, wav };
    } catch (err) {
      console.warn(`  edge-tts attempt ${attempt} failed for ${scene.id}: ${err.message.split("\n")[0]}`);
      if (attempt === 3) break;
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }

  console.warn(`  falling back to Windows SAPI for ${scene.id}`);
  const sapiWav = path.join(AUDIO_DIR, `${scene.id}.sapi.wav`);
  await synthSapi(scene.narration, sapiWav);
  await ffmpeg(["-i", sapiWav, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
  return { engine: "sapi:Microsoft Zira Desktop", wav };
}

export async function buildNarration() {
  await fs.mkdir(AUDIO_DIR, { recursive: true });

  const scenes = [];
  let total = 0;
  for (const scene of SCENES) {
    const { engine, wav } = await synthesizeScene(scene);
    const seconds = await probeDuration(wav);
    total += seconds;
    scenes.push({
      id: scene.id,
      text: scene.narration,
      audio: path.relative(CACHE, wav).replace(/\\/g, "/"),
      seconds: Number(seconds.toFixed(3)),
      engine,
      minSeconds: scene.minSeconds,
    });
    console.log(`  ${scene.id.padEnd(10)} ${seconds.toFixed(2)}s  ${engine}`);
  }

  const timing = { voice: VOICE, rate: RATE, speechSeconds: Number(total.toFixed(2)), scenes };
  await fs.writeFile(TIMING_FILE, JSON.stringify(timing, null, 2), "utf8");
  console.log(`  narration total ${total.toFixed(1)}s -> ${path.relative(process.cwd(), TIMING_FILE)}`);
  return timing;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildNarration().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
