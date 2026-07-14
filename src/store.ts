import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { Store } from "./types.js";

export function storePath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "sling", "requests.json");
}

export function load(file: string = storePath()): Store {
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed as Store : {};
  } catch {
    return {};
  }
}

export function save(store: Store, file: string = storePath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(store, null, 2) + "\n", "utf8");
}
