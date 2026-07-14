const KEEP = new Set(["authorization", "content-type", "cookie"]);
const DROP_EXACT = new Set([
  "priority", "accept-language", "accept-encoding", "referer",
  "dnt", "cache-control", "pragma",
]);
const DROP_PREFIX = ["sec-ch-ua", "sec-fetch-"];

function isNoise(key: string): boolean {
  const k = key.toLowerCase();
  if (KEEP.has(k)) return false;
  if (DROP_EXACT.has(k)) return true;
  return DROP_PREFIX.some((p) => k.startsWith(p));
}

export function cleanHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!isNoise(k)) out[k] = v;
  }
  return out;
}
