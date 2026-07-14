import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanHeaders } from "../src/cleaner.js";

test("drops noise headers, keeps signal headers", () => {
  const input = {
    "authorization": "Bearer x",
    "content-type": "application/json",
    "cookie": "sid=1",
    "sec-ch-ua": '"Chromium"',
    "sec-ch-ua-mobile": "?0",
    "sec-fetch-site": "same-origin",
    "priority": "u=1",
    "accept-language": "en-US",
    "accept-encoding": "gzip",
    "referer": "https://x.com",
    "dnt": "1",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "accept": "application/json"
  };
  const out = cleanHeaders(input);
  assert.deepEqual(out, {
    "authorization": "Bearer x",
    "content-type": "application/json",
    "cookie": "sid=1",
    "accept": "application/json"
  });
});

test("is case-insensitive on denylist keys", () => {
  const out = cleanHeaders({ "Sec-CH-UA": "x", "Authorization": "Bearer y" });
  assert.deepEqual(out, { "Authorization": "Bearer y" });
});
