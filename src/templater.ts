const VAR_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

function scan(text: string, acc: string[]): void {
  for (const m of text.matchAll(VAR_RE)) {
    if (!acc.includes(m[1])) acc.push(m[1]);
  }
}

export function detectVars(req: { url: string; headers: Record<string, string>; body: string | null }): string[] {
  const acc: string[] = [];
  scan(req.url, acc);
  for (const v of Object.values(req.headers)) scan(v, acc);
  if (req.body) scan(req.body, acc);
  return acc;
}

function fill(text: string, vars: Record<string, string>, missing: Set<string>): string {
  return text.replace(VAR_RE, (_, name) => {
    if (name in vars) return vars[name];
    missing.add(name);
    return `{{${name}}}`;
  });
}

export function substitute(
  req: { url: string; headers: Record<string, string>; body: string | null },
  vars: Record<string, string>,
): { url: string; headers: Record<string, string>; body: string | null; missing: string[] } {
  const missing = new Set<string>();
  const url = fill(req.url, vars, missing);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k] = fill(v, vars, missing);
  const body = req.body === null ? null : fill(req.body, vars, missing);
  return { url, headers, body, missing: [...missing] };
}
