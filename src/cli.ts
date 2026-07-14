#!/usr/bin/env node
import { parseArgs } from "node:util";
import { load, save } from "./store.js";
import { execute } from "./executor.js";
import { cmdAdd, cmdRun, cmdLs, cmdShow, cmdRm, type IO } from "./commands.js";

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    if (process.stdin.isTTY) resolve(""); // no piped input
  });
}

const HELP = `sling — terminal cURL replay tool

  sling add <name>        read a curl from stdin, clean + save it
  sling run <name> [--var k=v ...]   replay a saved request
  sling ls                list saved requests
  sling show <name>       print a saved request
  sling rm <name>         delete a saved request`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [command, name] = argv;
  const io: IO = {
    out: (s) => process.stdout.write(s + "\n"),
    err: (s) => process.stderr.write(s + "\n"),
    readStdin,
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
