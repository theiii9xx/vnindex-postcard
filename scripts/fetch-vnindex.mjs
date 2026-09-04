// Fetches the last N days of VN-Index data from VNDirect's public chart API
// and writes it to public/vnindex.json.
//
// This runs as a plain Node script (not inside Remotion's render browser) because
// VNDirect's bot-protection blocks requests coming from headless Chromium, but
// allows plain HTTP clients like Node's fetch/curl.
//
// Usage: node scripts/fetch-vnindex.mjs [days]

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const days = Number(process.argv[2] ?? 30);

const now = Math.floor(Date.now() / 1000);
const from = now - days * 3 * 24 * 60 * 60; // wide window to skip weekends/holidays

const url = `https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=VNINDEX&from=${from}&to=${now}`;

const response = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0" },
});

if (!response.ok) {
  throw new Error(`Failed to fetch VN-Index data: ${response.status} ${response.statusText}`);
}

const data = await response.json();

if (data.s !== "ok" || !data.t || data.t.length === 0) {
  throw new Error("VNDirect returned no VN-Index data");
}

const bars = data.t
  .map((time, i) => ({
    time,
    open: data.o[i],
    high: data.h[i],
    low: data.l[i],
    close: data.c[i],
    volume: data.v[i],
  }))
  // Drop the placeholder bar VNDirect sometimes appends for the current,
  // not-yet-traded session (zero volume, close copied from prior close).
  .filter((bar) => bar.volume > 0)
  .sort((a, b) => a.time - b.time)
  .slice(-days);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "public", "vnindex.json");

await writeFile(outPath, JSON.stringify(bars, null, 2), "utf-8");

const latest = bars[bars.length - 1];
console.log(
  `Wrote ${bars.length} bars to public/vnindex.json (latest: ${new Date(latest.time * 1000).toLocaleDateString("vi-VN")} close=${latest.close})`,
);
