#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const files = {
  packageJson: path.join(rootDir, "package.json"),
  cargoToml: path.join(rootDir, "src-tauri", "Cargo.toml"),
  tauriConfig: path.join(rootDir, "src-tauri", "tauri.conf.json"),
};

const versionFilePaths = [
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.conf.json",
];

function usage() {
  console.log(`
Usage:
  bun run release [patch|minor|major|x.y.z] [options]

Examples:
  bun run release
  bun run release minor
  bun run release 1.2.0
  bun run release patch -m "chore: release v1.2.1"

Options:
  -m, --message <text>  Pesan commit. Default: "chore: release v<version>"
  --no-push            Commit saja, tanpa push.
  --version-only       Commit hanya file versi, bukan semua perubahan kerja.
  -h, --help           Tampilkan bantuan ini.
`);
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`> ${printable}`);
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options,
  });
}

function output(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    if (options.allowFailure) {
      return "";
    }

    throw error;
  }
}

function parseArgs(argv) {
  const config = {
    bump: "patch",
    commitMessage: "",
    push: true,
    stageMode: "all",
  };
  let bumpSet = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }

    if (arg === "--no-push") {
      config.push = false;
      continue;
    }

    if (arg === "--version-only") {
      config.stageMode = "version-only";
      continue;
    }

    if (arg === "-m" || arg === "--message") {
      const nextArg = argv[index + 1];
      if (!nextArg) {
        fail(`Argumen ${arg} butuh isi pesan commit.`);
      }
      config.commitMessage = nextArg;
      index += 1;
      continue;
    }

    if (arg.startsWith("--message=")) {
      config.commitMessage = arg.slice("--message=".length);
      continue;
    }

    if (arg.startsWith("--")) {
      fail(`Argumen tidak dikenal: ${arg}`);
    }

    if (!bumpSet) {
      config.bump = arg;
      bumpSet = true;
      continue;
    }

    fail(`Argumen tidak dikenal: ${arg}`);
  }

  return config;
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    fail(`Format versi tidak valid: ${version}. Pakai format x.y.z, contoh 1.2.3.`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function getNextVersion(currentVersion, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump)) {
    return bump;
  }

  const current = parseVersion(currentVersion);

  if (bump === "major") {
    return formatVersion({ major: current.major + 1, minor: 0, patch: 0 });
  }

  if (bump === "minor") {
    return formatVersion({ major: current.major, minor: current.minor + 1, patch: 0 });
  }

  if (bump === "patch") {
    return formatVersion({ major: current.major, minor: current.minor, patch: current.patch + 1 });
  }

  fail(`Jenis bump tidak valid: ${bump}. Pakai patch, minor, major, atau versi x.y.z.`);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function readVersions() {
  const packageJson = readJson(files.packageJson);
  const tauriConfig = readJson(files.tauriConfig);
  const cargoToml = readFileSync(files.cargoToml, "utf8");
  const cargoVersionMatch = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m);

  if (!packageJson.version) {
    fail("package.json tidak punya field version.");
  }

  if (!tauriConfig.version) {
    fail("src-tauri/tauri.conf.json tidak punya field version.");
  }

  if (!cargoVersionMatch) {
    fail("src-tauri/Cargo.toml tidak punya version di bagian [package].");
  }

  return {
    packageJson,
    tauriConfig,
    cargoToml,
    versions: [
      ["package.json", packageJson.version],
      ["src-tauri/Cargo.toml", cargoVersionMatch[1]],
      ["src-tauri/tauri.conf.json", tauriConfig.version],
    ],
  };
}

function ensureVersionsMatch(versions) {
  const uniqueVersions = new Set(versions.map(([, version]) => version));

  if (uniqueVersions.size === 1) {
    return versions[0][1];
  }

  const details = versions.map(([file, version]) => `  - ${file}: ${version}`).join("\n");
  fail(`Versi belum sinkron, rapikan dulu sebelum release:\n${details}`);
}

function writeVersions(currentFiles, nextVersion) {
  const { packageJson, tauriConfig, cargoToml } = currentFiles;

  packageJson.version = nextVersion;
  tauriConfig.version = nextVersion;

  const cargoVersionPattern = /(^\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;
  const nextCargoToml = cargoToml.replace(
    cargoVersionPattern,
    (_match, before, _oldVersion, after) => `${before}${nextVersion}${after}`,
  );

  writeFileSync(files.packageJson, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(files.tauriConfig, `${JSON.stringify(tauriConfig, null, 2)}\n`);
  writeFileSync(files.cargoToml, nextCargoToml);
}

function stageChanges(stageMode) {
  if (stageMode === "version-only") {
    run("git", ["add", ...versionFilePaths]);
    return;
  }

  run("git", ["add", "-A"]);
}

function pushCurrentBranch() {
  const upstream = output("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
    allowFailure: true,
  });

  if (upstream) {
    run("git", ["push"]);
    return;
  }

  const branch = output("git", ["branch", "--show-current"]);
  if (!branch) {
    fail("Tidak bisa push karena HEAD sedang detached.");
  }

  run("git", ["push", "-u", "origin", branch]);
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  const currentFiles = readVersions();
  const currentVersion = ensureVersionsMatch(currentFiles.versions);
  const nextVersion = getNextVersion(currentVersion, config.bump);

  if (nextVersion === currentVersion) {
    fail(`Versi sudah ${currentVersion}. Pilih versi yang lebih baru.`);
  }

  const commitMessage = config.commitMessage || `chore: release v${nextVersion}`;

  console.log(`Release: ${currentVersion} -> ${nextVersion}`);
  writeVersions(currentFiles, nextVersion);
  stageChanges(config.stageMode);

  const stagedFiles = output("git", ["diff", "--cached", "--name-only"]);
  if (!stagedFiles) {
    fail("Tidak ada perubahan yang bisa di-commit.");
  }

  run("git", ["commit", "-m", commitMessage]);

  if (config.push) {
    pushCurrentBranch();
  } else {
    console.log("Skip push karena --no-push dipakai.");
  }
}

main();
