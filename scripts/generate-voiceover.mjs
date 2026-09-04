// Generates a short Vietnamese voiceover summarizing the day's VN-Index bar
// (from public/vnindex.json, written by fetch-vnindex.mjs) using Microsoft
// Edge's free "Read Aloud" TTS service (via the msedge-tts package) — no
// account or API key needed.
//
// Writes public/voiceover/vnindex-latest.mp3.
//
// Usage: node scripts/generate-voiceover.mjs

import { readFileSync, renameSync, mkdirSync, rmSync } from "node:fs";
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

// Build "ngày <d> tháng <m>" by hand instead of toLocaleDateString: some Node ICU
// builds render vi-VN dates as "04-09" (a dash), which TTS can misread as a
// subtraction. Spelling out "ngày ... tháng ..." is unambiguous either way.
const date = new Date(latest.time * 1000);
const dateStr = `ngày ${date.getDate()} tháng ${date.getMonth() + 1}`;

// --- Extra context so the narration comfortably fills ~60s instead of ~15s ---
const closes30 = bars.map((b) => b.close);
const min30 = Math.min(...closes30);
const max30 = Math.max(...closes30);
const pctAboveMin = ((latest.close - min30) / min30) * 100;
const pctBelowMax = ((max30 - latest.close) / max30) * 100;

let upDays = 0;
let downDays = 0;
for (let i = 1; i < bars.length; i++) {
  if (bars[i].close > bars[i - 1].close) upDays++;
  else if (bars[i].close < bars[i - 1].close) downDays++;
}

const todayRangeText =
  Math.abs(latest.high - latest.low) < 0.005
    ? ""
    : ` Trong phiên, chỉ số dao động trong khoảng từ ${fmt(latest.low)} đến ${fmt(latest.high)} điểm.`;

const intro =
  "Xin chào quý nhà đầu tư, đây là bản tin nhanh thị trường chứng khoán Việt Nam, cập nhật tự động hàng ngày.";

const todayPart = isFlat
  ? `Kết thúc phiên giao dịch ${dateStr}, chỉ số VN Index đóng cửa tại ${fmt(latest.close)} điểm, gần như đi ngang so với phiên liền trước.${todayRangeText} Khối lượng giao dịch toàn thị trường đạt khoảng ${volumeMillions} triệu cổ phiếu.`
  : `Kết thúc phiên giao dịch ${dateStr}, chỉ số VN Index đóng cửa tại ${fmt(latest.close)} điểm, ${trendWord} ${fmt(Math.abs(change))} điểm so với phiên liền trước, tương ứng ${fmt(Math.abs(changePercent))} phần trăm.${todayRangeText} Khối lượng giao dịch toàn thị trường đạt khoảng ${volumeMillions} triệu cổ phiếu.`;

// Avoid the awkward "thấp hơn khoảng 0,00 phần trăm" when today's close IS the
// 30-day min/max — say so plainly instead of a near-zero percentage.
const vsMinText =
  pctAboveMin < 0.05
    ? "cũng chính là mức thấp nhất của giai đoạn này"
    : `đang cao hơn khoảng ${fmt(pctAboveMin)} phần trăm so với mức thấp nhất của giai đoạn này`;
const vsMaxText =
  pctBelowMax < 0.05
    ? "cũng chính là mức cao nhất của giai đoạn này"
    : `đang thấp hơn khoảng ${fmt(pctBelowMax)} phần trăm so với mức cao nhất giai đoạn này`;

const contextPart = `Nhìn lại ba mươi phiên giao dịch gần nhất, chỉ số VN Index đã dao động trong biên độ từ ${fmt(min30)} đến ${fmt(max30)} điểm. Mức đóng cửa hiện tại ${vsMinText}, và ${vsMaxText}. Trong ba mươi phiên gần nhất, thị trường ghi nhận ${upDays} phiên tăng điểm và ${downDays} phiên giảm điểm.`;

const outro =
  "Quý nhà đầu tư vui lòng tiếp tục theo dõi sát diễn biến thị trường trong các phiên giao dịch tiếp theo. Đây là bản tin tổng hợp dữ liệu tự động, không phải khuyến nghị đầu tư. Xin cảm ơn quý vị đã theo dõi.";

const text = [intro, todayPart, contextPart, outro].join(" ");

console.log(`Generating voiceover (${voiceName}): "${text}"`);

const outDir = path.join(root, "public", "voiceover");
mkdirSync(outDir, { recursive: true });

// toFile writes into a folder with an auto-generated filename; move it to our fixed name after.
const tmpDir = path.join(outDir, ".tmp");
mkdirSync(tmpDir, { recursive: true });

// The Edge TTS websocket occasionally drops mid-stream (transient, unrelated to
// the text) — retry a couple of times before giving up, since this runs unattended.
let audioFilePath;
let lastError;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    ({ audioFilePath } = await tts.toFile(tmpDir, text));
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

const finalPath = path.join(outDir, "vnindex-latest.mp3");
renameSync(audioFilePath, finalPath);
rmSync(tmpDir, { recursive: true, force: true });

console.log(`Wrote ${finalPath}`);
