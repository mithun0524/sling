# sling — terminal cURL replay tool

**Date:** 2026-07-14
**Status:** Design approved, pending spec review

## Problem

Developers copy "Copy as cURL" from browser devtools and re-run the same authenticated
request repeatedly in the terminal, hand-editing the JSON body each time. Traces from the
author's shell history: `curl --location` run 35+ times, each carrying 22+ pasted browser
headers (`sec-ch-ua*`, `sec-fetch-*`, `authorization`, `accept-language`, `priority`, ...),
with hand-edited JSON payloads.

Existing tools don't fit the loop: Postman is a heavy GUI; HTTPie/Hurl don't do the
browser-paste cleanup. The specific micro-workflow — *paste browser cURL → auto-strip junk
headers → save as named request → replay with swappable vars* — has no clean terminal-native
tool.

## Goal

A zero-GUI CLI that turns a messy browser cURL into a named, replayable, parameterized
request stored on disk.

**In scope (v1):** clean, save, parameterize, replay.
**Out of scope (v1):** environment profiles (dev/stage/prod), secret vaults, request
chaining, response assertions, GUI. These are deliberate future work, not v1.

## Commands

```
sling add <name>          # read cURL from stdin (or clipboard), parse + clean + store
sling run <name> [--var id=123 --var tenant=abc]   # replay, substitute {{vars}}
sling ls                  # list saved request names
sling show <name>         # print stored request (method, url, headers, body, vars)
sling rm <name>           # delete a saved request
```

## Core flow (add)

1. Read raw browser cURL from stdin (fallback: system clipboard).
2. Parse to a structured request: `{ method, url, headers, body }`.
3. Clean: drop noise headers by denylist —
   `sec-ch-ua*`, `sec-fetch-*`, `priority`, `accept-language`, `accept-encoding`,
   `referer`, `dnt`, `cache-control`, `pragma`. **Keep** `authorization`, `content-type`,
   `cookie`, and the body.
4. Detect candidate vars (path segments that look like IDs, values in the JSON body) and
   offer to templatize each as `{{name}}`. User accepts/skips per candidate.
5. Save to `~/.config/sling/requests.json`.

## Core flow (run)

1. Load named request.
2. Substitute `{{vars}}` from `--var k=v` flags.
3. If any `{{var}}` is unfilled, error and list the missing names (no request fired).
4. Fire via native `fetch`.
5. Pretty-print: status code, elapsed ms, response body (JSON pretty-printed if parseable).

## Units (isolated, independently testable)

| Unit | Job | Depends on |
|---|---|---|
| `parser` | cURL string → `{method, url, headers, body}` | nothing |
| `cleaner` | drop noise headers by denylist | nothing |
| `store` | load/save named requests to JSON | fs |
| `templater` | `{{var}}` detect + substitute | nothing |
| `executor` | fire request, format response | fetch |
| `cli` | route argv → commands | all above |

Each unit is a pure module where possible (`parser`, `cleaner`, `templater` are pure
string→data functions with no I/O). `store` and `executor` isolate all I/O. `cli` is the
only unit that touches process argv / stdout.

## Data shape

```jsonc
// ~/.config/sling/requests.json
{
  "<name>": {
    "method": "POST",
    "url": "https://api.example.com/tenant/{{tenant}}/user/{{id}}",
    "headers": { "authorization": "Bearer ...", "content-type": "application/json" },
    "body": "{\"description\":\"{{desc}}\"}",
    "vars": ["tenant", "id", "desc"]
  }
}
```

## Stack

- Node + TypeScript.
- Zero runtime dependencies target: native `fetch`, `node:util` `parseArgs`,
  `node:fs`, `node:child_process` (clipboard fallback via `pbpaste`).
- Distributed via npm; runnable with `npx sling`.

## Error handling

| Case | Behavior |
|---|---|
| cURL fails to parse | Print which token/segment failed; do not save. |
| `run` with unfilled `{{vars}}` | Error, list missing var names, fire nothing. |
| Unknown request name | Error, suggest `sling ls`. |
| Network failure | Print status/error message + elapsed time. |
| Corrupt/missing store file | Treat as empty store; recreate on next save. |

## Testing

Unit tests per pure module (`parser`, `cleaner`, `templater`) with fixture cURL strings
(including a real 22-header browser paste). `store` tested against a temp dir. `executor`
tested against a local mock server. No network in tests.

## Success criteria

- Paste a real browser "Copy as cURL", get a clean saved request in one command.
- Replay it by name with a changed `--var` in one command.
- Zero runtime dependencies.
