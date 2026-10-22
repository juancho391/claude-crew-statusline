#!/bin/sh
# Installer for claude-crew-statusline: a Claude Code status line and the subagent crew pane.
#
#   curl -fsSL https://raw.githubusercontent.com/juancho391/claude-crew-statusline/v0.2.0/install.sh | sh
#   curl -fsSL .../install.sh | sh -s -- --statusline-only
#   curl -fsSL .../install.sh | sh -s -- --pane-only
#   curl -fsSL .../install.sh | sh -s -- --theme mocha --background '#1e1e2e'
#   curl -fsSL .../install.sh | sh -s -- --ref main
#   curl -fsSL .../install.sh | sh -s -- --uninstall
#
# Never overwrites settings.json: it backs it up once and merges with jq.
# Environment: CREW_REF (branch or tag, default v0.2.0), CREW_SRC (local checkout, for testing).

set -eu

REPO=juancho391/claude-crew-statusline
REF=${CREW_REF:-v0.2.0}
CLAUDE="$HOME/.claude"
SETTINGS="$CLAUDE/settings.json"
BACKUP="$CLAUDE/settings.json.bak-crew-statusline"
PLUGIN_DIR='~/.claude/mods/subagent-crew'
DO_STATUS=1 DO_PANE=1 UNINSTALL=0 THEME='' BACKGROUND=''
PLUGIN_KEY='subagent-crew@inline'
THEMES='warp midnight mocha light'

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case $1 in
    --uninstall) UNINSTALL=1 ;;
    --statusline-only) DO_PANE=0 ;;
    --pane-only) DO_STATUS=0 ;;
    --theme) shift; [ $# -gt 0 ] || die '--theme needs a value'; THEME=$1
      case " $THEMES " in *" $THEME "*) ;; *) die "unknown theme: $THEME (choose one of: $THEMES)" ;; esac ;;
    --background) shift; [ $# -gt 0 ] || die '--background needs a value'; BACKGROUND=$1
      printf '%s' "$BACKGROUND" | grep -Eq '^#[0-9a-fA-F]{6}$' || die "--background must be #RRGGBB, got: $BACKGROUND" ;;
    --ref) shift; [ $# -gt 0 ] || die '--ref needs a value'; REF=$1 ;;
    -h|--help) sed -n '2,11p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

[ "$DO_STATUS" = 1 ] || [ "$DO_PANE" = 1 ] || die 'nothing to do: --statusline-only and --pane-only cancel out'
if [ -n "$THEME$BACKGROUND" ] && [ "$DO_PANE" = 0 ]; then die '--theme and --background configure the pane; drop --statusline-only.'; fi
command -v jq >/dev/null 2>&1 || die 'jq is required (brew install jq, or apt install jq), then retry.'

mkdir -p "$CLAUDE"
[ -f "$SETTINGS" ] || echo '{}' >"$SETTINGS"
jq empty "$SETTINGS" 2>/dev/null || die "$SETTINGS is not valid JSON; fix it first."

backup() { [ -f "$BACKUP" ] || { cp "$SETTINGS" "$BACKUP"; say "Backed up settings to $BACKUP"; }; }

# Rewrite settings.json through a jq filter, validating before replacing it.
edit_settings() {
  jq "$@" "$SETTINGS" >"$SETTINGS.new" && jq empty "$SETTINGS.new" || { rm -f "$SETTINGS.new"; die 'settings merge failed; settings.json left untouched.'; }
  mv "$SETTINGS.new" "$SETTINGS"
}

if [ "$UNINSTALL" = 1 ]; then
  backup
  if [ "$DO_STATUS" = 1 ]; then
    rm -f "$CLAUDE/statusline.sh" "$CLAUDE/statusline-state.sh"
    rm -rf "$CLAUDE/statusline-state"
    edit_settings '
      (if .hooks then
         .hooks |= (with_entries(.value |= map(select(tostring | contains("statusline-state.sh") | not)))
                    | with_entries(select(.value | length > 0)))
         | (if .hooks == {} then del(.hooks) else . end)
       else . end)
      | (if .statusLine.command == "~/.claude/statusline.sh" then del(.statusLine) else . end)'
  fi
  if [ "$DO_PANE" = 1 ]; then
    rm -rf "$CLAUDE/mods/subagent-crew"
    rmdir "$CLAUDE/mods" 2>/dev/null || true
    edit_settings --arg dir "$PLUGIN_DIR" --arg key "$PLUGIN_KEY" '
      (if .env.CLAUDE_CODE_PLUGIN_DIRS == $dir then del(.env.CLAUDE_CODE_PLUGIN_DIRS) else . end)
      | (if .env == {} then del(.env) else . end)
      | (if .pluginConfigs then del(.pluginConfigs[$key]) else . end)
      | (if .pluginConfigs == {} then del(.pluginConfigs) else . end)'
  fi
  say 'Uninstalled. Restart Claude Code for it to take effect.'
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM
if [ -n "${CREW_SRC:-}" ]; then
  SRC=$CREW_SRC
else
  command -v curl >/dev/null 2>&1 || die 'curl is required.'
  say "Downloading $REPO@$REF"
  curl --proto '=https' --proto-redir '=https' -fsSL "https://codeload.github.com/$REPO/tar.gz/$REF" -o "$TMP/src.tgz" \
    || die "could not download $REPO@$REF (check the ref name and your connection)."
  mkdir "$TMP/src" && tar -xzf "$TMP/src.tgz" -C "$TMP/src" --strip-components=1 || die 'could not unpack the download.'
  SRC=$TMP/src
fi
[ -f "$SRC/statusline/merge-settings.jq" ] || die "$SRC does not look like this repo."

backup

if [ "$DO_STATUS" = 1 ]; then
  cp "$SRC/statusline/statusline.sh" "$SRC/statusline/statusline-state.sh" "$CLAUDE/"
  chmod +x "$CLAUDE/statusline.sh" "$CLAUDE/statusline-state.sh"
  current=$(jq -r '.statusLine.command // ""' "$SETTINGS")
  if [ -n "$current" ] && [ "$current" != "~/.claude/statusline.sh" ]; then
    say "Replacing your existing statusLine ($current); the backup keeps it."
  fi
  edit_settings --slurpfile ex "$SRC/statusline/settings.example.json" -f "$SRC/statusline/merge-settings.jq"
  say 'Installed the status line.'
fi

if [ "$DO_PANE" = 1 ]; then
  mkdir -p "$CLAUDE/mods"
  rm -rf "$CLAUDE/mods/subagent-crew"
  cp -R "$SRC/mods/subagent-crew" "$CLAUDE/mods/"
  current=$(jq -r '.env.CLAUDE_CODE_PLUGIN_DIRS // ""' "$SETTINGS")
  if [ -z "$current" ] || [ "$current" = "$PLUGIN_DIR" ]; then
    edit_settings --arg dir "$PLUGIN_DIR" '.env = ((.env // {}) + {CLAUDE_CODE_PLUGIN_DIRS: $dir})'
    say 'Installed the crew pane.'
  else
    say "Installed the crew pane files, but CLAUDE_CODE_PLUGIN_DIRS is already set to:"
    say "  $current"
    say "Not changing it. Add $PLUGIN_DIR to it yourself, then restart Claude Code."
  fi
  if [ -n "$THEME" ]; then
    edit_settings --arg key "$PLUGIN_KEY" --arg v "$THEME" '.pluginConfigs[$key].options.theme = $v'
    say "Pane theme: $THEME"
  fi
  if [ -n "$BACKGROUND" ]; then
    edit_settings --arg key "$PLUGIN_KEY" --arg v "$BACKGROUND" '.pluginConfigs[$key].options.background = $v'
    say "Pane background: $BACKGROUND"
  fi
fi

if [ "$DO_PANE" = 1 ]; then say 'Done. Restart Claude Code, then run /crew to open the Agents pane.'
else say 'Done. Restart Claude Code to see the status line.'; fi
