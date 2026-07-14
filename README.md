# sling

Terminal cURL replay tool. Paste a browser "Copy as cURL", sling strips the junk
headers, saves it by name, and lets you replay it — with swappable `{{vars}}`.

## Install

    npm install -g sling

## Use

    # Save a request (paste the curl on stdin):
    pbpaste | sling add my-req
    # or
    echo "curl 'https://api.example.com/u/{{id}}' -H 'authorization: Bearer x'" | sling add my-req

    sling ls                       # list saved
    sling show my-req              # inspect
    sling run my-req --var id=42   # replay, filling {{id}}
    sling rm my-req                # delete

Requests are stored in `~/.config/sling/requests.json`.

To parameterize a request, write `{{name}}` where you want a swappable value
(in the URL, a header value, or the body) before saving. sling detects them and
you fill them at run time with `--var name=value`.

Requires Node ≥ 20. Zero runtime dependencies.
