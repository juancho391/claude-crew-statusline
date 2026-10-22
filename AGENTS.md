# Install guide for coding agents

Instructions for an agent (Claude Code, Codex, Cursor, ...) asked to install this repo into the user's Claude Code setup. Complete the install and verify it; do not stop at a plan.

This repo ships two independent parts. Install both unless the user asks for one:

- `statusline/`: a Claude Code status line plus hook helper.
- `mods/subagent-crew/`: the "Agents" pane plugin.

## Rules

- Never overwrite `~/.claude/settings.json`. Back it up, then merge with the provided jq filter.
- Do not remove or reorder the user's existing hooks, env vars or permissions.
- If `CLAUDE_CODE_PLUGIN_DIRS` is already set to a different value, do not replace it: show the user the current value and ask how to combine them.
- The commands below assume the repo root as the working directory and `~/.claude` as the Claude Code config dir.
- Name any step you cannot perform instead of skipping it.

## Prerequisites

Check each and report what is missing: `jq` (required), a 24-bit-color terminal (status line colors), Claude Code with plugin/mod support (for the pane).

```sh
command -v jq >/dev/null || echo "jq missing: brew install jq (macOS) / apt install jq (Linux)"
```

## Steps

1. **Back up settings.**
   ```sh
   cp ~/.claude/settings.json ~/.claude/settings.json.bak-crew-statusline
   ```
   If `~/.claude/settings.json` does not exist, create it with `echo '{}' > ~/.claude/settings.json` first.

2. **Install the status line scripts.**
   ```sh
   cp statusline/statusline.sh statusline/statusline-state.sh ~/.claude/
   chmod +x ~/.claude/statusline.sh ~/.claude/statusline-state.sh
   ```
   If `settings.json` already has a different `statusLine`, tell the user it will be replaced and keep the backup.

3. **Merge the status line and hooks into settings.** The filter is idempotent: running it twice changes nothing.
   ```sh
   jq --slurpfile ex statusline/settings.example.json -f statusline/merge-settings.jq \
     ~/.claude/settings.json > ~/.claude/settings.json.new \
     && jq empty ~/.claude/settings.json.new \
     && mv ~/.claude/settings.json.new ~/.claude/settings.json
   ```

4. **Install the crew pane.**
   ```sh
   mkdir -p ~/.claude/mods
   cp -R mods/subagent-crew ~/.claude/mods/
   ```

5. **Register the pane plugin dir.** Set `env.CLAUDE_CODE_PLUGIN_DIRS` to `~/.claude/mods/subagent-crew` (see the rule above if it already has a value):
   ```sh
   jq '.env = ((.env // {}) + {CLAUDE_CODE_PLUGIN_DIRS: "~/.claude/mods/subagent-crew"})' \
     ~/.claude/settings.json > ~/.claude/settings.json.new \
     && jq empty ~/.claude/settings.json.new \
     && mv ~/.claude/settings.json.new ~/.claude/settings.json
   ```

6. **Restart Claude Code.** Settings, hooks and plugin dirs load at session start; the user must start a new session. Say so explicitly.

## Verify

Run these and report the observed results:

```sh
# Status line renders from a sample payload (expect one colored line with the model name)
echo '{"session_id":"t","model":{"display_name":"Claude Test"},"context_window":{"used_percentage":42}}' \
  | ~/.claude/statusline.sh

# Hook helper records state and exits 0
echo '{"session_id":"t","tool_name":"Bash"}' | ~/.claude/statusline-state.sh pre-tool; echo "exit=$?"
cat ~/.claude/statusline-state/t   # expect: tool|Bash|<epoch>
rm -f ~/.claude/statusline-state/t

# Settings are valid and wired
jq -e '.statusLine.command, .hooks.PreToolUse, .env.CLAUDE_CODE_PLUGIN_DIRS' ~/.claude/settings.json >/dev/null && echo settings-ok
test -f ~/.claude/mods/subagent-crew/.claude-plugin/plugin.json && echo plugin-ok
```

After the restart (user-side check): the status line shows the model and context bar, and `/crew` opens the Agents pane.

## Uninstall

```sh
rm -f ~/.claude/statusline.sh ~/.claude/statusline-state.sh
rm -rf ~/.claude/mods/subagent-crew ~/.claude/statusline-state
cp ~/.claude/settings.json.bak-crew-statusline ~/.claude/settings.json   # restores the pre-install settings
```

If the user changed settings after installing, edit `settings.json` by hand instead of restoring the backup.

## Report

State what was installed, what was skipped and why, the verification output, and that a Claude Code restart is required.
