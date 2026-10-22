#!/usr/bin/env bash
# Claude Code status line: model, activity, context window, 5-hour session and weekly limits.
# Reads the JSON payload Claude Code sends on stdin. Uses 24-bit color (Warp, iTerm2, Ghostty...).

input=$(cat)

rgb() { printf '\033[38;2;%d;%d;%dm' "$1" "$2" "$3"; }
RESET=$'\033[0m'
MUTED=$(rgb 108 112 134)   # labels, separators, empty track
TEXT=$(rgb 205 214 244)    # model name
MINT=$(rgb 126 224 181)    # < 60%
AMBER=$(rgb 245 194 107)   # 60-84%
CORAL=$(rgb 255 107 129)   # >= 85%
SEP="  ${MUTED}│${RESET}  "

color_for() { # pct -> color
  local p=$1
  if (( p >= 85 )); then printf '%s' "$CORAL"
  elif (( p >= 60 )); then printf '%s' "$AMBER"
  else printf '%s' "$MINT"; fi
}

bar() { # pct -> thin 8-cell bar
  local p=$1 c filled i out=""
  (( p > 100 )) && p=100
  c=$(color_for "$p")
  filled=$(( (p * 8 + 50) / 100 ))
  out+="$c"
  for ((i = 0; i < 8; i++)); do
    (( i == filled )) && out+="$MUTED"
    out+="━"
  done
  printf '%s%s' "$out" "$RESET"
}

until_reset() { # epoch seconds or ISO string -> "2h13" / "3d"
  local ts=$1 secs d h m
  [[ -z $ts ]] && return
  if [[ $ts =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    ts=${ts%.*}
    (( ts > 9999999999 )) && ts=$(( ts / 1000 ))
  else
    ts=$(date -j -u -f '%Y-%m-%dT%H:%M:%S' "${ts%%.*}" +%s 2>/dev/null) || return
  fi
  secs=$(( ts - $(date +%s) ))
  (( secs <= 0 )) && return
  d=$(( secs / 86400 )); h=$(( secs % 86400 / 3600 )); m=$(( secs % 3600 / 60 ))
  if (( d > 0 )); then printf '%dd' "$d"
  elif (( h > 0 )); then printf '%dh%02d' "$h" "$m"
  else printf '%dm' "$m"; fi
}

segment() { # label pct reset
  local label=$1 pct=$2 left
  [[ -z $pct ]] && return
  left=$(until_reset "$3")
  printf '%s%s%s %s %s%d%%%s' "$SEP" "$MUTED" "$label" "$(bar "$pct")" "$(color_for "$pct")" "$pct" "$RESET"
  [[ -n $left ]] && printf ' %s%s%s' "$MUTED" "$left" "$RESET"
}

IFS='|' read -r sid model ctx_pct ctx_size ctx_used five five_reset week week_reset < <(jq -r '
  def pct: if . == null then "" else (. | round | tostring) end;
  (.context_window.current_usage // {}) as $u
  | [ (.session_id // "default"),
      (.model.display_name // .model.id // "claude"),
      (.context_window.used_percentage | pct),
      (.context_window.context_window_size // 200000),
      (($u.input_tokens // 0) + ($u.cache_creation_input_tokens // 0) + ($u.cache_read_input_tokens // 0)),
      (.rate_limits.five_hour.used_percentage | pct),
      (.rate_limits.five_hour.resets_at // "" | tostring),
      (.rate_limits.seven_day.used_percentage | pct),
      (.rate_limits.seven_day.resets_at // "" | tostring) ]
  | map(tostring) | join("|")' <<<"$input")

[[ -z $ctx_pct && $ctx_used -gt 0 ]] && ctx_pct=$(( ctx_used * 100 / ctx_size ))

# Activity, written by statusline-state.sh hooks. The status line re-runs every
# second (refreshInterval), so the frame index is simply the current second.
now=$(date +%s)
state="" tool="" since=$now
[[ -f $HOME/.claude/statusline-state/$sid ]] &&
  IFS='|' read -r state tool since <"$HOME/.claude/statusline-state/$sid"
age=$(( now - ${since:-$now} ))
LILAC=$(rgb 180 190 254)

pick() { # frame-indexed element of the remaining args
  local -a f=("$@")
  printf '%s' "${f[$(( now % ${#f[@]} ))]}"
}

activity=""
case $state in
  thinking)
    verbs=(thinking pondering brewing scheming conjuring noodling)
    activity="${LILAC}$(pick ✶ ✸ ✹ ✺ ✹ ✸) ${verbs[$(( now / 4 % ${#verbs[@]} ))]}${RESET}"
    ;;
  tool)
    case $tool in
      Edit|Write|MultiEdit|NotebookEdit) label="✎ writing" ;;
      Bash)                              label="⚡ running" ;;
      Read|Grep|Glob|LS|mcp__codegraph*) label="⌕ reading" ;;
      Agent|Task)                        label="⇶ delegating" ;;
      WebFetch|WebSearch)                label="◍ browsing" ;;
      *)                                 label="⚙ working" ;;
    esac
    activity="${MINT}${label} $(pick ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)${RESET}"
    ;;
  ask)
    activity="$(pick "$CORAL" "$MUTED")● needs you${RESET}"
    ;;
  done)
    if (( age < 15 )); then
      activity="${MINT}$(pick ✓ ✔) done${RESET}"
    elif (( age > 300 )); then
      activity="${MUTED}💤 $(pick 'z  ' 'zZ ' 'zZz')${RESET}"
    fi
    ;;
esac

short=$(tr '[:upper:]' '[:lower:]' <<<"$model" | sed -E 's/^claude //')
out="${TEXT}${short}${RESET}"
[[ -n $activity ]] && out+=" ${activity}"
[[ -n $ctx_pct ]] && out+="${SEP}${MUTED}ctx${RESET} $(bar "$ctx_pct") $(color_for "$ctx_pct")${ctx_pct}%${RESET}"
out+=$(segment "5h" "$five" "$five_reset")
out+=$(segment "wk" "$week" "$week_reset")

printf '%s\n' "$out"
