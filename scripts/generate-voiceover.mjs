// Generates a Vietnamese voiceover summarizing the day's VN-Index bar (from
// public/vnindex.json, written by fetch-vnindex.mjs) using Microsoft Edge's
// free "Read Aloud" TTS service (via the msedge-tts package) — no account or
// API key needed.
//
// The script is built as exactly six single-sentence segments (hook,
// headline, todayDetail, range30, trend30, outro). Edge TTS's sentence-
// boundary metadata gives each segment's start time in the generated audio,
// which is written to public/voiceover/vnindex-latest.beats.json so the
// video can trigger visual "beats" in sync with the narration.
//
// Writes:
//   public/voiceover/vnindex-latest.mp3
//   public/voiceover/vnindex-latest.beats.json  (best-effort; sync is optional)
//
// Usage: node scripts/generate-voiceover.mjs

import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const voiceName = process.env.EDGE_TTS_VOICE || "vi-VN-HoaiMyNeural"; // vi-VN-NamMinhNeural for a male voice

const dataPath = path.join(root, "public", "vnindex.json");
const bars = JSON.parse(readFileSync(dataPath, "utf-8"));

if (!bars || bars.length < 2) {
  throw new Error("public/vnindex.json has fewer than 2 bars — run fetch-data first.");
}

const latest = bars[bars.length - 1];
const previous = bars[bars.length - 2];
const change = latest.close - previous.close;
const changePercent = (change / previous.close) * 100;
const isFlat = Math.abs(change) < 0.005;
const trendWord = isFlat ? "đi ngang" : change > 0 ? "tăng" : "giảm";

// vi-VN decimal formatting (comma, not dot) — read naturally by TTS.
const fmt = (n) => n.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt1 = (n) => n.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const volumeMillions = fmt1(latest.volume / 1_000_000);

// "ngày <d> tháng <m>" spelled out by hand — some Node ICU builds render vi-VN
// dates as "04-09" (a dash), which TTS can misread as a subtraction.
const date = new Date(latest.time * 1000);
const dateStr = `ngày ${date.getDate()} tháng ${date.getMonth() + 1}`;

// --- Derived stats for narrative context ---
const closes30 = bars.map((b) => b.close);
const min30 = Math.min(...closes30);
const max30 = Math.max(...closes30);
const pctAboveMin = ((latest.close - min30) / min30) * 100;
const pctBelowMax = ((max30 - latest.close) / max30) * 100;
const isNewHigh = pctBelowMax < 0.05;
const isNewLow = pctAboveMin < 0.05;

let upDays = 0;
let downDays = 0;
for (let i = 1; i < bars.length; i++) {
  if (bars[i].close > bars[i - 1].close) upDays++;
  else if (bars[i].close < bars[i - 1].close) downDays++;
}

const overallChangePercent30 = ((latest.close - bars[0].close) / bars[0].close) * 100;
const overallTrendWord = overallChangePercent30 >= 0 ? "tăng" : "giảm";

const avgVolume30 =
  bars.slice(0, -1).reduce((sum, b) => sum + b.volume, 0) / Math.max(1, bars.length - 1);
const volumeRatio = latest.volume / (avgVolume30 || 1);
const isBigMove = Math.abs(changePercent) >= 1.5;
const isVolumeSpike = volumeRatio >= 1.3;

// --- Build the script as exactly six single-sentence segments ---
// (each ends with exactly one '.'/'!' and has no other sentence-ending
// punctuation inside, so Edge TTS's sentence-boundary count lines up 1:1
// with this array for timing sync.)

let hook;
if (isNewHigh && change > 0) {
  hook = "Tin vui cho nhà đầu tư, VN Index vừa xác lập đỉnh cao mới trong ba mươi phiên giao dịch gần đây.";
} else if (isNewLow && change < 0) {
  hook = "Thị trường vừa ghi nhận một phiên giảm điểm đáng chú ý, đưa VN Index về mức thấp nhất trong ba mươi phiên gần đây.";
} else if (isBigMove && change > 0) {
  hook = "Một phiên giao dịch bùng nổ đã diễn ra trên thị trường chứng khoán Việt Nam hôm nay.";
} else if (isBigMove && change < 0) {
  hook = "Sắc đỏ bao trùm thị trường chứng khoán Việt Nam trong phiên giao dịch hôm nay.";
} else if (isVolumeSpike) {
  hook = "Thanh khoản thị trường bất ngờ sôi động hơn hẳn so với những phiên gần đây.";
} else {
  const genericHooks = [
    "Cùng điểm qua diễn biến thị trường chứng khoán Việt Nam hôm nay.",
    "Đây là bản tin nhanh cập nhật thị trường chứng khoán Việt Nam.",
    "Thị trường chứng khoán Việt Nam khép lại một phiên giao dịch mới với nhiều diễn biến đáng chú ý.",
  ];
  hook = genericHooks[Math.floor(Math.random() * genericHooks.length)];
}

const headline = isFlat
  ? `Chỉ số VN Index đóng cửa phiên ${dateStr} tại ${fmt(latest.close)} điểm, gần như đi ngang so với phiên liền trước.`
  : `Chỉ số VN Index đóng cửa phiên ${dateStr} tại ${fmt(latest.close)} điểm, ${trendWord} ${fmt(Math.abs(change))} điểm, tương ứng ${fmt(Math.abs(changePercent))} phần trăm so với phiên liền trước.`;

const volumeAdj = isVolumeSpike
  ? "sôi động hơn hẳn so với trung bình gần đây"
  : volumeRatio < 0.7
    ? "khá trầm lắng so với trung bình gần đây"
    : "ở mức tương đương trung bình gần đây";

const todayDetail = `Trong phiên, chỉ số dao động trong khoảng từ ${fmt(latest.low)} đến ${fmt(latest.high)} điểm, với khối lượng giao dịch toàn thị trường đạt khoảng ${volumeMillions} triệu cổ phiếu, ${volumeAdj}.`;

const vsMinText =
  pctAboveMin < 0.05
    ? "cũng chính là mức thấp nhất"
    : `cao hơn khoảng ${fmt(pctAboveMin)} phần trăm so với mức thấp nhất`;
const vsMaxText =
  pctBelowMax < 0.05
    ? "cũng chính là mức cao nhất"
    : `thấp hơn khoảng ${fmt(pctBelowMax)} phần trăm so với mức cao nhất`;

const range30 = `Nhìn lại ba mươi phiên giao dịch gần nhất, chỉ số đã dao động trong biên độ từ ${fmt(min30)} đến ${fmt(max30)} điểm, với mức đóng cửa hiện tại ${vsMinText} và ${vsMaxText} của giai đoạn này, còn tính chung cả ba mươi phiên, VN Index đã ${overallTrendWord} khoảng ${fmt(Math.abs(overallChangePercent30))} phần trăm.`;

const trend30 = `Trong ba mươi phiên gần nhất, thị trường ghi nhận ${upDays} phiên tăng điểm và ${downDays} phiên giảm điểm.`;

const outro = "Đây là bản tin tổng hợp dữ liệu tự động, không phải khuyến nghị đầu tư, xin cảm ơn quý vị đã theo dõi.";

const segments = [
  { id: "hook", text: hook },
  { id: "headline", text: headline },
  { id: "todayDetail", text: todayDetail },
  { id: "range30", text: range30 },
  { id: "trend30", text: trend30 },
  { id: "outro", text: outro },
];

const text = segments.map((s) => s.text).join(" ");

console.log(`Generating voiceover (${voiceName}): "${text}"`);

const outDir = path.join(root, "public", "voiceover");
mkdirSync(outDir, { recursive: true });

const tmpDir = path.join(outDir, ".tmp");
mkdirSync(tmpDir, { recursive: true });

// The Edge TTS websocket occasionally drops mid-stream (transient, unrelated to
// the text) — retry a couple of times before giving up, since this runs unattended.
let audioFilePath;
let metadataFilePath;
let lastError;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, {
      sentenceBoundaryEnabled: true,
    });
    ({ audioFilePath, metadataFilePath } = await tts.toFile(tmpDir, text));
    lastError = null;
    break;
  } catch (err) {
    lastError = err;
    console.log(`Edge TTS attempt ${attempt}/3 failed: ${err.message}`);
  }
}

if (lastError) {
  throw lastError;
}

const finalAudioPath = path.join(outDir, "vnindex-latest.mp3");
renameSync(audioFilePath, finalAudioPath);
console.log(`Wrote ${finalAudioPath}`);

// --- Build beats.json from sentence-boundary metadata (best-effort) ---
const beatsPath = path.join(outDir, "vnindex-latest.beats.json");
try {
  if (!metadataFilePath || !existsSync(metadataFilePath)) {
    throw new Error("No metadata file returned by Edge TTS");
  }
  const metadata = JSON.parse(readFileSync(metadataFilePath, "utf-8"));
  const sentenceEvents = (metadata.Metadata || []).filter(
    (m) => m.Type === "SentenceBoundary",
  );

  if (sentenceEvents.length !== segments.length) {
    throw new Error(
      `Expected ${segments.length} sentence boundaries, got ${sentenceEvents.length} — skipping sync data`,
    );
  }

  const beats = {};
  segments.forEach((seg, i) => {
    const offsetTicks = sentenceEvents[i].Data.Offset; // 100ns ticks
    beats[seg.id] = {
      startMs: Math.round(offsetTicks / 10000),
      text: seg.text,
    };
  });

  writeFileSync(beatsPath, JSON.stringify(beats, null, 2));
  console.log(`Wrote ${beatsPath}`);
} catch (err) {
  console.log(`Skipping beats.json (visual sync will fall back to defaults): ${err.message}`);
}

rmSync(tmpDir, { recursive: true, force: true });
