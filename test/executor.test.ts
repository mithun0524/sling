import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, Server } from "node:http";
import { execute } from "../src/executor.js";

function listen(handler: (req: any, res: any) => void): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

test("executes a GET and pretty-prints JSON body", async () => {
  const { server, url } = await listen((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  const result = await execute({ method: "GET", url, headers: {}, body: null });
  assert.equal(result.status, 200);
  assert.equal(result.body, '{\n  "ok": true\n}');
  assert.ok(result.elapsedMs >= 0);
  server.close();
});

test("sends method, headers and body", async () => {
  let seen: any = {};
  const { server, url } = await listen((req, res) => {
    let data = "";
    req.on("data", (c: Buffer) => (data += c));
    req.on("end", () => {
      seen = { method: req.method, auth: req.headers["authorization"], body: data };
      res.writeHead(201).end("created");
    });
  });
  const result = await execute({
    method: "POST", url,
    headers: { "authorization": "Bearer t" },
    body: '{"a":1}',
  });
  assert.equal(result.status, 201);
  assert.equal(result.body, "created");
  assert.equal(seen.method, "POST");
  assert.equal(seen.auth, "Bearer t");
  assert.equal(seen.body, '{"a":1}');
  server.close();
});
