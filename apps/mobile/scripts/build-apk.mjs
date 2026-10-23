// Builds an Android APK, as Phaseo's README and Solar's scripts do: by default a standalone one (no Metro needed),
// expo prebuild, then Gradle assembleRelease. The APK is signed with the debug
// key: fine to sideload onto your own phone, not for the Play Store.
//
//   pnpm apk               arm64 only (almost every phone since ~2017)
//   pnpm apk --all         every ABI, bigger and slower to build
//   pnpm apk --clean       regenerate android/ first (after app.json or native changes)
//   pnpm apk --debug       a development build instead, which loads the JavaScript from Metro (pnpm dev)
//   pnpm apk --no-deploy   build only; otherwise it copies to Drive and installs over Wi-Fi

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const android = join(root, "android");
const debug = process.argv.includes("--debug");
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, NODE_ENV: debug ? "development" : "production" } });

// Regenerating android/ forces a full native rebuild (~20 minutes), so only do it when it's missing
// or asked for (after changing app.json, plugins or native dependencies).
if (!existsSync(android) || process.argv.includes("--clean")) run("pnpm exec expo prebuild --platform android --clean --no-install");

// Point Gradle at the SDK, and at CMake 3.31: the SDK's default 3.22 can loop forever on Windows
// ("build.ninja still dirty after 100 tries"; see Phaseo's apps/mobile/README.md).
const sdk = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk");
const cmakeRoot = join(sdk, "cmake");
const cmake = existsSync(cmakeRoot) ? readdirSync(cmakeRoot).filter((v) => /^3\.(3\d|[4-9]\d)/.test(v)).sort().pop() : undefined;
const props = [`sdk.dir=${sdk.replace(/\\/g, "/")}`];
if (cmake) props.push(`cmake.dir=${join(cmakeRoot, cmake).replace(/\\/g, "/")}`);
writeFileSync(join(android, "local.properties"), `${props.join("\n")}\n`);

const abis = process.argv.includes("--all") ? "armeabi-v7a,arm64-v8a,x86,x86_64" : "arm64-v8a";
// An absolute path: Windows may not search the current folder for commands
const gradlew = join(android, process.platform === "win32" ? "gradlew.bat" : "gradlew");
run(`"${gradlew}" ${debug ? "assembleDebug" : "assembleRelease"} -PreactNativeArchitectures=${abis} --console=plain`, android);

const variant = debug ? "debug" : "release";
const apk = join(android, "app", "build", "outputs", "apk", variant, `app-${variant}.apk`);
const out = join(root, "pitwall.apk");
copyFileSync(apk, out);
console.log(`\nAPK ready: ${out}`);

// Ship it: Google Drive, and any phone on wireless debugging (--no-deploy to skip)
if (!process.argv.includes("--no-deploy")) run("node scripts/deploy.mjs");
