#!/usr/bin/env node

/**
 * ESMT Hackathon — One-command bootstrap
 * Usage: npm run setup
 *
 * Works on macOS, Windows, and Linux.
 * Creates a Python venv, installs Python + Node deps, and verifies everything.
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";

const isWindows = platform() === "win32";
const VENV_DIR = ".venv";
const PYTHON_BIN = isWindows
  ? join(VENV_DIR, "Scripts", "python.exe")
  : join(VENV_DIR, "bin", "python");
const PIP_BIN = isWindows
  ? join(VENV_DIR, "Scripts", "pip.exe")
  : join(VENV_DIR, "bin", "pip");

// ── Helpers ──────────────────────────────────────────────────────────

const green = (t) => `\x1b[32m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const bold = (t) => `\x1b[1m${t}\x1b[0m`;

function step(msg) {
  console.log(`\n${bold("▸")} ${msg}`);
}

function ok(msg) {
  console.log(`  ${green("✔")} ${msg}`);
}

function warn(msg) {
  console.log(`  ${yellow("⚠")} ${msg}`);
}

function fail(msg) {
  console.error(`  ${red("✖")} ${msg}`);
}

/** Run a command and return { ok, stdout }. Swallows errors. */
function run(cmd, opts = {}) {
  try {
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      ...opts,
    }).trim();
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: "" };
  }
}

/** Run a command with live output so students see progress. */
function runLoud(cmd) {
  const result = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
  });
  return result.status === 0;
}

// ── Steps ────────────────────────────────────────────────────────────

function checkNode() {
  step("Checking Node.js");
  const { ok: found, stdout } = run("node --version");
  if (!found) {
    fail("Node.js not found. Install it from https://nodejs.org");
    process.exit(1);
  }
  const major = parseInt(stdout.replace("v", ""), 10);
  if (major < 18) {
    fail(
      `Node.js ${stdout} is too old. You need v18 or newer.\n    Download from https://nodejs.org`
    );
    process.exit(1);
  }
  ok(`Node.js ${stdout}`);
}

function findPython() {
  step("Checking Python");
  // Try common names in order of preference
  for (const cmd of ["python3", "python"]) {
    const { ok: found, stdout } = run(`${cmd} --version`);
    if (found && stdout.startsWith("Python 3")) {
      const parts = stdout.replace("Python ", "").split(".");
      const minor = parseInt(parts[1], 10);
      if (minor < 10) {
        fail(
          `${stdout} is too old. You need Python 3.10 or newer.\n    Download from https://www.python.org/downloads/`
        );
        process.exit(1);
      }
      ok(`${stdout} (${cmd})`);
      return cmd;
    }
  }
  fail(
    "Python 3.10+ not found.\n    Download from https://www.python.org/downloads/"
  );
  process.exit(1);
}

function createVenv(pythonCmd) {
  step("Creating Python virtual environment");
  if (existsSync(PYTHON_BIN)) {
    ok(`Virtual environment already exists (.venv/)`);
    return;
  }
  if (!runLoud(`${pythonCmd} -m venv ${VENV_DIR}`)) {
    fail("Could not create virtual environment.");
    process.exit(1);
  }
  ok("Created .venv/");
}

function installPythonDeps() {
  step("Installing Python dependencies");
  if (!runLoud(`${PIP_BIN} install -e ".[dev]" --quiet`)) {
    fail("pip install failed. Check the error above.");
    process.exit(1);
  }
  ok("FastAPI, uvicorn, pydantic, pytest, httpx installed");
}

function installNodeDeps() {
  step("Installing Node.js dependencies");
  if (existsSync("node_modules")) {
    ok("node_modules/ already exists — skipping (run npm install to refresh)");
    return;
  }
  if (!runLoud("npm install")) {
    fail("npm install failed. Check the error above.");
    process.exit(1);
  }
  ok("React, Tailwind, vitest installed");
}

function verify() {
  step("Verifying installation");
  let allGood = true;

  const { ok: pytestOk } = run(`${PYTHON_BIN} -m pytest --version`);
  if (pytestOk) {
    ok("pytest");
  } else {
    fail("pytest not found");
    allGood = false;
  }

  const { ok: fastapiOk } = run(
    `${PYTHON_BIN} -c "import fastapi; print(fastapi.__version__)"`
  );
  if (fastapiOk) {
    ok("FastAPI");
  } else {
    fail("FastAPI not importable");
    allGood = false;
  }

  const { ok: vitestOk } = run("npx vitest --version");
  if (vitestOk) {
    ok("vitest");
  } else {
    fail("vitest not found");
    allGood = false;
  }

  return allGood;
}

// ── Main ─────────────────────────────────────────────────────────────

console.log(bold("\n🚀 ESMT Hackathon — Project Setup\n"));

checkNode();
const pythonCmd = findPython();
createVenv(pythonCmd);
installPythonDeps();
installNodeDeps();

const allGood = verify();

if (allGood) {
  console.log(`
${green(bold("━━━ Setup complete! ━━━"))}

${bold("Next steps:")}

  1. Start Claude Code:  ${bold("claude")}
  2. Define your startup: ${bold("/interview")}
  3. Start building:      ${bold("/start")}

${bold("Useful commands:")}
  npm run dev          Start frontend + backend (http://localhost:5173)
  npm test             Run all tests
`);
} else {
  console.log(`\n${red("Some checks failed.")} Fix the errors above and run ${bold("npm run setup")} again.\n`);
  process.exit(1);
}
