// Before `next dev`: rebuild public/data/search-index.json and the card files if any is
// missing or older than data/f1.json (e.g. after pulling without re-running the data build).

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = join(root, "data", "f1.json");
const outputs = ["search-index.json", "cards.json", "race-cards.json", "more-cards.json", "guess.json", "fantasy.json", "career.json", "higher-lower.json", "constructor-guess.json", "circuit-guess.json", "chain.json", "grid.json", "race-entries.json", "race-guess.json", "lap-chart.json", "season-guess.json", "results/index.json"].map((f) => join(root, "public", "data", f));
const stale = (f) => !existsSync(f) || statSync(f).mtimeMs < statSync(data).mtimeMs;

if (existsSync(data) && outputs.some(stale)) {
	execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", join(root, "scripts", "build-client-data.ts")], { stdio: "inherit" });
}
