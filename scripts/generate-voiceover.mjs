// Generates a short Vietnamese voiceover summarizing the day's VN-Index bar
// (from public/vnindex.json, written by fetch-vnindex.mjs) using ElevenLabs TTS,
// and writes it to public/voiceover/vnindex-latest.mp3.
//
// Requires ELEVENLABS_API_KEY (see .env.example). Skips silently (no audio,
// video still renders fine without narration) if the key is not set, so this
// stays optional rather than breaking the daily render.
//
// Usage: node --env-file=.env scripts/generate-voiceover.mjs

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const apiKey = process.env.ELEVENLABS_API_KEY;

if (!apiKey) {
  console.log(
    "ELEVENLABS_API_KEY not set — skipping voiceover generation (video will render silently). See .env.example.",
  );
  process.exit(0);
}

const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs default multilingual voice

const dataPath = path.join(root, "public", "vnindex.json");
const bars = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(dataPath, "utf-8")));

if (!bars || bars.length < 2) {
  throw new Error("public/vnindex.json has fewer than 2 bars — run fetch-data first.");
}

const latest = bars[bars.length - 1];
const previous = bars[bars.length - 2];
const change = latest.close - previous.close;
const changePercent = (change / previous.close) * 100;
const isFlat = Math.abs(change) < 0.005;
const trendWord = isFlat ? "đi ngang" : change > 0 ? "tăng" : "giảm";

const fmt = (n) => n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const volumeMillions = (latest.volume / 1_000_000).toFixed(1);

const date = new Date(latest.time * 1000);
const dateStr = date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });

const text = isFlat
  ? `VN Index phiên ngày ${dateStr} đóng cửa tại ${fmt(latest.close)} điểm, gần như đi ngang so với phiên trước. Khối lượng giao dịch toàn thị trường đạt khoảng ${volumeMillions} triệu cổ phiếu.`
  : `VN Index phiên ngày ${dateStr} đóng cửa tại ${fmt(latest.close)} điểm, ${trendWord} ${fmt(Math.abs(change))} điểm, tương ứng ${Math.abs(changePercent).toFixed(2)} phần trăm. Khối lượng giao dịch toàn thị trường đạt khoảng ${volumeMillions} triệu cổ phiếu.`;

console.log(`Generating voiceover: "${text}"`);

const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
  method: "POST",
  headers: {
    "xi-api-key": apiKey,
    "Content-Type": "application/json",
    Accept: "audio/mpeg",
  },
  body: JSON.stringify({
    text,
    model_id: "eleven_multilingual_v2",
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
  }),
});

if (!response.ok) {
  const body = await response.text().catch(() => "");
  throw new Error(`ElevenLabs TTS failed: ${response.status} ${response.statusText} ${body}`);
}

const audioBuffer = Buffer.from(await response.arrayBuffer());

const outDir = path.join(root, "public", "voiceover");
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, "vnindex-latest.mp3");
await writeFile(outFile, audioBuffer);

console.log(`Wrote ${outFile} (${(audioBuffer.length / 1024).toFixed(0)} KB)`);
