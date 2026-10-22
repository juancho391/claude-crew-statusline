# Hook helper for Windows PowerShell 5.1+: records what Claude is doing so the status line can animate it.
# Port of statusline-state.sh. Usage (from hooks): statusline-state.ps1 <event>; hook JSON arrives on stdin.
# Keep this file ASCII only: Windows PowerShell 5.1 reads BOM-less files as ANSI.

param([Parameter(Position = 0)][string]$EventName)

$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

try {
  $raw = [Console]::In.ReadToEnd()
  $j = $null
  try { $j = $raw | ConvertFrom-Json } catch {}

  function Clean($v) { if ($null -eq $v) { return '' } return ("$v" -replace '\|', ' ') }
  $sid = Clean $j.session_id; if ($sid -eq '') { $sid = 'default' }
  $tool = Clean $j.tool_name
  $msg = Clean $j.message

  $userHome = [Environment]::GetFolderPath('UserProfile')
  $dir = Join-Path (Join-Path $userHome '.claude') 'statusline-state'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $file = Join-Path $dir $sid

  if ($env:STATUSLINE_NOW) { $now = [long]$env:STATUSLINE_NOW } else { $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }

  $line = $null
  switch ($EventName) {
    'prompt' {
      $line = "thinking||$now"
      # Housekeeping: forget sessions older than a day.
      Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | Remove-Item -Force
    }
    'pre-tool' { $line = "tool|$tool|$now" }
    'post-tool' { $line = "thinking||$now" }
    'notify' {
      # Only permission prompts mean "Claude needs you"; idle reminders are ignored.
      if ($msg -like '*ermission*') { $line = "ask||$now" }
    }
    'stop' { $line = "done||$now" }
  }
  if ($null -ne $line) {
    [System.IO.File]::WriteAllText($file, "$line`n", (New-Object System.Text.UTF8Encoding($false)))
  }
} catch {}
exit 0
