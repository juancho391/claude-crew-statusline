#!/usr/bin/env bash
# Hook helper: records what Claude is doing so the status line can animate it.
# Usage (from hooks): statusline-state.sh <event>   — hook JSON arrives on stdin.

event=$1
input=$(cat)
dir="$HOME/.claude/statusline-state"
mkdir -p "$dir"

IFS='|' read -r sid tool msg < <(jq -r '[(.session_id // "default"), (.tool_name // ""), (.message // "")] | map(tostring | gsub("\\|"; " ")) | join("|")' <<<"$input" 2>/dev/null)
[[ -n $sid ]] || sid=default # unparsable or empty input still records a state
file="$dir/$sid"
now=${STATUSLINE_NOW:-$(date +%s)}

case $event in
  prompt)
    printf 'thinking||%s\n' "$now" >"$file"
    # Housekeeping: forget sessions older than a day.
    find "$dir" -type f -mtime +1 -delete 2>/dev/null
    ;;
  pre-tool)  printf 'tool|%s|%s\n' "$tool" "$now" >"$file" ;;
  post-tool) printf 'thinking||%s\n' "$now" >"$file" ;;
  notify)
    # Only permission prompts mean "Claude needs you"; idle reminders are ignored.
    [[ $msg == *ermission* ]] && printf 'ask||%s\n' "$now" >"$file"
    ;;
  stop)      printf 'done||%s\n' "$now" >"$file" ;;
esac
exit 0
