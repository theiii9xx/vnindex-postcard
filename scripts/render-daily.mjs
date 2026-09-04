// Renders the VNIndexPostcard composition to renders/vnindex-YYYY-MM-DD.mp4
// (tracked in git, unlike out/ which is gitignored scratch output).
//
// Usage: node scripts/render-daily.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const rendersDir = path.join(root, "renders");
mkdirSync(rendersDir, { recursive: true });

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const outFile = path.join("renders", `vnindex-${today}.mp4`);

console.log(`Rendering VNIndexPostcard -> ${outFile}`);

execFileSync(
  "npx",
  ["remotion", "render", "VNIndexPostcard", outFile],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);

console.log(`Done: ${outFile}`);
