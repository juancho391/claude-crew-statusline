# usage: jq --slurpfile ex statusline/settings.example.json -f merge.jq settings.json
. as $s | $ex[0] as $e
| .statusLine = $e.statusLine
| .hooks = (reduce ($e.hooks | keys[]) as $k (.hooks // {};
    if ((.[$k] // []) | tostring | contains("statusline-state.sh")) then .
    else .[$k] = ((.[$k] // []) + $e.hooks[$k]) end))
