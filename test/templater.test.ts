import { test } from "node:test";
import assert from "node:assert/strict";
import { detectVars, substitute } from "../src/templater.js";

test("detectVars finds distinct names in first-seen order", () => {
  const req = {
    url: "https://x.com/{{tenant}}/user/{{id}}",
    headers: { "authorization": "Bearer {{token}}" },
    body: '{"id":"{{id}}"}',
  };
  assert.deepEqual(detectVars(req), ["tenant", "id", "token"]);
});

test("substitute fills provided vars and reports missing", () => {
  const req = {
    url: "https://x.com/{{tenant}}/user/{{id}}",
    headers: { "authorization": "Bearer {{token}}" },
    body: null,
  };
  const out = substitute(req, { tenant: "abc", id: "42" });
  assert.equal(out.url, "https://x.com/abc/user/42");
  assert.deepEqual(out.missing, ["token"]);
});

test("substitute with all vars leaves no missing", () => {
  const out = substitute({ url: "{{a}}", headers: {}, body: null }, { a: "1" });
  assert.equal(out.url, "1");
  assert.deepEqual(out.missing, []);
});

test("substitute resolves {{env:NAME}} from the env map", () => {
  const out = substitute(
    { url: "https://x.com", headers: { authorization: "Bearer {{env:TOKEN}}" }, body: null },
    {},
    { TOKEN: "abc" },
  );
  assert.equal(out.headers.authorization, "Bearer abc");
  assert.deepEqual(out.missing, []);
});

test("substitute reports missing env var with env: prefix", () => {
  const out = substitute(
    { url: "https://x.com", headers: { authorization: "Bearer {{env:TOKEN}}" }, body: null },
    {},
    {},
  );
  assert.deepEqual(out.missing, ["env:TOKEN"]);
});

test("detectVars ignores {{env:NAME}} forms", () => {
  const vars = detectVars({ url: "https://x.com/{{id}}", headers: { authorization: "Bearer {{env:TOKEN}}" }, body: null });
  assert.deepEqual(vars, ["id"]);
});
