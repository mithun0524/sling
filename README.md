<p align="center">
  <img src="assets/logo.png" alt="sling" width="560">
</p>

<h3 align="center">Paste a browser cURL. Strip the junk. Save it. Sling it — forever.</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/curl-sling"><img alt="npm" src="https://img.shields.io/npm/v/curl-sling?color=38bdf8&label=curl-sling&logo=npm"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520-3c873a?logo=node.js&logoColor=white">
  <img alt="deps" src="https://img.shields.io/badge/runtime%20deps-0-a78bfa">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-64748b">
</p>

---

## The itch

You open devtools, right-click a request, **Copy as cURL**. You paste a 22-header
monster into your terminal to replay it. Then you do it again. And again — tweaking one
ID in the JSON body each time.

```
curl 'https://api.example.com/tenant/abc/user/42' \
  -H 'sec-ch-ua: "Chromium";v="120"' \
  -H 'sec-fetch-site: same-origin' \
  -H 'accept-language: en-US' \
  -H 'priority: u=1' \
  ... 18 more lines of noise ...
  -H 'authorization: Bearer eyJ...' \
  --data-raw '{"userId":"42"}'
```

Postman's a whole GUI. HTTPie/Hurl don't clean the browser paste. So you keep suffering.

**`sling` is the fix.** It parses the paste, throws away the noise headers, keeps what
matters, saves it by name, and lets you replay it with swappable `{{vars}}`.

## Install

```bash
npm install -g curl-sling      # command is `sling`
```

## 30-second tour

```bash
# 1. Copy a request in devtools (Copy as cURL), then just:
sling add get-user            # reads your clipboard — no pipe needed

#    → saved 'get-user' (GET https://api.example.com/tenant/{{tenant}}/user/{{id}})
#      — vars: tenant, id
#      (sec-ch-ua, sec-fetch-*, priority, accept-language … all stripped)

# 2. Replay it — fill the vars, get a clean response
sling run get-user --var tenant=abc --var id=42

#    → 200  118ms
#      {
#        "id": "42",
#        "name": "Ada"
#      }
#    forget a --var? it prompts you for it instead of failing.

# 3. The rest
sling edit get-user   # tweak it in $EDITOR
sling ls              # list saved requests
sling show get-user   # inspect one
sling rm  get-user    # delete one
```

## The `{{var}}` trick

Anywhere you want a swappable value — in the URL, a header, or the body — write
`{{name}}` before you save:

```bash
echo "curl 'https://api.example.com/u/{{id}}' -H 'authorization: Bearer {{token}}'" \
  | sling add whoami
```

`sling` detects them. At run time you fill each one:

```bash
sling run whoami --var id=42 --var token=abc123
```

Forget one? On an interactive terminal it **prompts** you for it. In a script
(piped, non-interactive) it refuses to fire and tells you which is missing — no
half-baked requests:

```
missing: token. Pass vars with --var name=value.
```

### Secrets stay out of the store

For tokens and keys, use `{{env:NAME}}` — resolved from your environment at run
time, **never written to disk**:

```bash
echo "curl 'https://api.example.com/me' -H 'authorization: Bearer {{env:API_TOKEN}}'" \
  | sling add me

API_TOKEN=sk-live-… sling run me     # token pulled from env, never stored
```

The saved request keeps the literal `Bearer {{env:API_TOKEN}}` — your secret
never touches `requests.json`.

## What gets stripped

Kept: `authorization`, `content-type`, `cookie`, and everything else meaningful.
Dropped (browser noise): `sec-ch-ua*`, `sec-fetch-*`, `priority`, `accept-language`,
`accept-encoding`, `referer`, `dnt`, `cache-control`, `pragma`.

## Where it lives

Requests are stored as plain JSON at `~/.config/sling/requests.json`
(honors `$XDG_CONFIG_HOME`). Readable, grep-able, git-able.

## Under the hood

Six tiny, single-purpose modules — `parser` · `cleaner` · `templater` · `store` ·
`executor` · `cli`. Native `fetch`, `node:util.parseArgs`, `node:test`.
**Zero runtime dependencies.** Node ≥ 20.

```bash
git clone https://github.com/mithun0524/sling
cd sling && npm install
npm test        # 19 tests
npm run build
```

## License

MIT © [mithun0524](https://github.com/mithun0524)
