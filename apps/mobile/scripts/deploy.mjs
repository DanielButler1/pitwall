// Ships the built APK: copies it to Google Drive (G:/My Drive/Pitwall App) and installs it on any phone reachable
// over wireless debugging. Run after a build (pnpm apk does this), or on its own: pnpm run deploy (plain `pnpm deploy` is a pnpm command).
//
// Wi-Fi installs of a 35 MB APK often drop mid-stream, so the file is pushed to the phone first (each attempt
// restarts cleanly) and installed from there.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const apk = join(root, "pitwall.apk");
const PACKAGE = "app.phaseo.pitwall";
const DRIVE = process.env.PITWALL_DRIVE_DIR ?? "G:/My Drive/Pitwall App";

/** Runs adb and returns everything it printed: it reports some successes ("1 file pushed") on stderr. */
const adb = (args, timeout = 30_000) => {
	const r = spawnSync("adb", args, { encoding: "utf8", timeout });
	return `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? r.error.message : ""}`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function copyToDrive() {
	if (!existsSync(DRIVE.split("/").slice(0, 2).join("/"))) return console.log(`Drive: ${DRIVE} isn't available, skipped`);
	mkdirSync(DRIVE, { recursive: true });
	const target = join(DRIVE, "Pitwall.apk");
	copyFileSync(apk, target);
	const same = readFileSync(apk).equals(readFileSync(target));
	console.log(same ? `Drive: copied to ${target}` : "Drive: copy doesn't match the build!");
}

/** Phones connected over wireless debugging, connecting to any that advertise themselves. */
async function phones() {
	for (let attempt = 0; attempt < 4; attempt++) {
		// adb on Windows ends lines with \r\n
		const services = adb(["mdns", "services"], 15_000).split(/\r?\n/).filter((l) => l.includes("_adb-tls-connect")).map((l) => l.trim().split(/\s+/).at(-1));
		for (const s of [...new Set(services)]) adb(["connect", s], 15_000);
		const devices = adb(["devices"]).split(/\r?\n/).filter((l) => /\tdevice$/.test(l)).map((l) => l.split("\t")[0]);
		if (devices.length) return devices;
		await sleep(4000);
	}
	return [];
}

async function install(device) {
	for (let attempt = 1; attempt <= 3; attempt++) {
		const pushed = adb(["-s", device, "push", apk, "/data/local/tmp/pitwall.apk"], 600_000);
		if (/pushed|file pushed/.test(pushed)) {
			const out = adb(["-s", device, "shell", "pm", "install", "-r", "/data/local/tmp/pitwall.apk"], 180_000);
			adb(["-s", device, "shell", "rm", "-f", "/data/local/tmp/pitwall.apk"]);
			if (out.includes("Success")) {
				adb(["-s", device, "shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1"]);
				return console.log(`Phone ${device}: installed and opened`);
			}
			console.log(`Phone ${device}: install failed (${out.trim().split("\n").at(-1)})`);
		} else console.log(`Phone ${device}: transfer dropped (attempt ${attempt})`);
		// The connection often comes back on a new port
		await phones();
	}
	console.log(`Phone ${device}: gave up. Install from Drive, or run pnpm run deploy once wireless debugging is back.`);
}

copyToDrive();
const found = await phones();
if (!found.length) console.log("Phone: none on wireless debugging, skipped (Settings > Developer options > Wireless debugging)");
for (const d of found) await install(d);
