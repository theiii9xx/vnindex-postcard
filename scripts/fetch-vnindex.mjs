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

// HOSE trades ~9:00-15:00 Asia/Ho_Chi_Minh (morning + afternoon sessions incl.
// the ATC close auction). Get "today"/"now" in that timezone regardless of the
// host machine's own timezone, so this is correct whether it runs on a local
// PC or a UTC server.
const ICT_TIMEZONE = "Asia/Ho_Chi_Minh";
const MARKET_CLOSE_HOUR = 15; // treat the session as not-yet-closed before 15:05 ICT
const MARKET_CLOSE_MINUTE = 5;

const ictPartsOf = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ICT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
};

const nowICT = ictPartsOf(new Date());

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
  // Drop today's bar too if today's session hasn't actually closed yet —
  // otherwise a run during trading hours reports a live intraday tick as if
  // it were the day's close. (The daily automation runs at 8am ICT, before
  // the market opens, so this never trims anything there; it only matters
  // for an ad-hoc run made during trading hours.)
  .filter((bar) => {
    const barICT = ictPartsOf(new Date(bar.time * 1000));
    if (barICT.dateStr !== nowICT.dateStr) return true; // not today — always fine
    const marketClosed =
      nowICT.hour > MARKET_CLOSE_HOUR ||
      (nowICT.hour === MARKET_CLOSE_HOUR && nowICT.minute >= MARKET_CLOSE_MINUTE);
    return marketClosed;
  })
  .sort((a, b) => a.time - b.time)
  .slice(-days);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "public", "vnindex.json");

await writeFile(outPath, JSON.stringify(bars, null, 2), "utf-8");

const latest = bars[bars.length - 1];
console.log(
  `Wrote ${bars.length} bars to public/vnindex.json (latest: ${new Date(latest.time * 1000).toLocaleDateString("vi-VN")} close=${latest.close})`,
);
