const VAR_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
const ENV_RE = /\{\{env:([A-Z_][A-Z0-9_]*)\}\}/g;

function scan(text: string, acc: string[]): void {
  for (const m of text.matchAll(VAR_RE)) {
    if (!acc.includes(m[1])) acc.push(m[1]);
  }
}

// Detect fillable {{name}} vars only. {{env:NAME}} forms are resolved automatically
// from the environment at run time and are never listed here.
export function detectVars(req: { url: string; headers: Record<string, string>; body: string | null }): string[] {
  const acc: string[] = [];
  scan(req.url, acc);
  for (const v of Object.values(req.headers)) scan(v, acc);
  if (req.body) scan(req.body, acc);
  return acc;
}

function fill(
  text: string,
  vars: Record<string, string>,
  env: Record<string, string | undefined>,
  missing: Set<string>,
): string {
  // Resolve {{env:NAME}} first so a literal {{env:...}} can never be treated as a normal var.
  const withEnv = text.replace(ENV_RE, (_, name) => {
    const val = env[name];
    if (val === undefined) { missing.add(`env:${name}`); return `{{env:${name}}}`; }
    return val;
  });
  return withEnv.replace(VAR_RE, (_, name) => {
    if (name in vars) return vars[name];
    missing.add(name);
    return `{{${name}}}`;
  });
}

export function substitute(
  req: { url: string; headers: Record<string, string>; body: string | null },
  vars: Record<string, string>,
  env: Record<string, string | undefined> = {},
): { url: string; headers: Record<string, string>; body: string | null; missing: string[] } {
  const missing = new Set<string>();
  const url = fill(req.url, vars, env, missing);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k] = fill(v, vars, env, missing);
  const body = req.body === null ? null : fill(req.body, vars, env, missing);
  return { url, headers, body, missing: [...missing] };
}
