import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCurl } from "../src/parser.js";

test("parses a browser copy-as-curl with headers and JSON body", () => {
  const input = `curl 'https://api.example.com/tenant/abc/user/42' \\
    -X POST \\
    -H 'authorization: Bearer tok123' \\
    -H 'content-type: application/json' \\
    -H 'sec-ch-ua: "Chromium";v="120"' \\
    --data-raw '{"description":"Rushin"}'`;
  const r = parseCurl(input);
  assert.equal(r.method, "POST");
  assert.equal(r.url, "https://api.example.com/tenant/abc/user/42");
  assert.equal(r.headers["authorization"], "Bearer tok123");
  assert.equal(r.headers["content-type"], "application/json");
  assert.equal(r.headers["sec-ch-ua"], '"Chromium";v="120"');
  assert.equal(r.body, '{"description":"Rushin"}');
});

test("defaults to GET when no method and no body", () => {
  const r = parseCurl(`curl 'https://x.com/a'`);
  assert.equal(r.method, "GET");
  assert.equal(r.body, null);
});

test("infers POST when body present and no explicit method", () => {
  const r = parseCurl(`curl 'https://x.com/a' --data '{"k":1}'`);
  assert.equal(r.method, "POST");
});

test("throws when input is not a curl command", () => {
  assert.throws(() => parseCurl("wget https://x.com"), /not a curl command/i);
});
