#!/usr/bin/env node
import { parseArgs } from "node:util";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, save } from "./store.js";
import { execute } from "./executor.js";
import { cmdAdd, cmdRun, cmdEdit, cmdLs, cmdShow, cmdRm, type IO } from "./commands.js";

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(""); return; } // no piped input
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

async function readClipboard(): Promise<string> {
  const cmd = process.platform === "darwin" ? "pbpaste"
    : process.platform === "win32" ? "powershell"
    : "xclip";
  const args = process.platform === "win32" ? ["-command", "Get-Clipboard"]
    : process.platform === "linux" ? ["-selection", "clipboard", "-o"]
    : [];
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  return res.status === 0 && res.stdout ? res.stdout : "";
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

function openEditor(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const editor = process.env.EDITOR || process.env.VISUAL || "vi";
    const dir = mkdtempSync(join(tmpdir(), "sling-edit-"));
    const file = join(dir, "request.json");
    writeFileSync(file, text, "utf8");
    const child = spawn(editor, [file], { stdio: "inherit" });
    child.on("exit", () => {
      try {
        const edited = readFileSync(file, "utf8");
        rmSync(dir, { recursive: true, force: true });
        resolve(edited);
      } catch (e) {
        rmSync(dir, { recursive: true, force: true });
        reject(e);
      }
    });
    child.on("error", reject);
  });
}

const HELP = `sling — terminal cURL replay tool

  sling add <name>        read a curl (stdin or clipboard), clean + save it
  sling run <name> [--var k=v ...]   replay a saved request
  sling edit <name>       edit a saved request in $EDITOR
  sling ls                list saved requests
  sling show <name>       print a saved request
  sling rm <name>         delete a saved request

Use {{name}} for values you fill with --var (or you'll be prompted).
Use {{env:NAME}} for secrets pulled from your environment at run time.`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [command, name] = argv;
  const io: IO = {
    out: (s) => process.stdout.write(s + "\n"),
    err: (s) => process.stderr.write(s + "\n"),
    readStdin,
    readClipboard,
    prompt,
    openEditor,
    isTTY: Boolean(process.stdin.isTTY),
    env: process.env,
    load,
    save,
    execute,
  };

  switch (command) {
    case "add":
      if (!name) { io.err("usage: sling add <name>"); return 1; }
      return cmdAdd(name, io);
    case "run": {
      if (!name) { io.err("usage: sling run <name> [--var k=v]"); return 1; }
      const { values } = parseArgs({
        args: argv.slice(2),
        options: { var: { type: "string", multiple: true } },
        allowPositionals: true,
      });
      return cmdRun(name, (values.var as string[]) ?? [], io);
    }
    case "edit":
      if (!name) { io.err("usage: sling edit <name>"); return 1; }
      return cmdEdit(name, io);
    case "ls": return cmdLs(io);
    case "show":
      if (!name) { io.err("usage: sling show <name>"); return 1; }
      return cmdShow(name, io);
    case "rm":
      if (!name) { io.err("usage: sling rm <name>"); return 1; }
      return cmdRm(name, io);
    default:
      io.out(HELP);
      return command ? 1 : 0;
  }
}

main().then((code) => process.exit(code));
