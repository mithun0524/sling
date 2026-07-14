export interface ExecResult {
  status: number;
  elapsedMs: number;
  body: string;
}

function prettyIfJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export async function execute(
  req: { method: string; url: string; headers: Record<string, string>; body: string | null },
): Promise<ExecResult> {
  const start = performance.now();
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body === null ? undefined : req.body,
  });
  const text = await res.text();
  const elapsedMs = Math.round(performance.now() - start);
  return { status: res.status, elapsedMs, body: prettyIfJson(text) };
}
