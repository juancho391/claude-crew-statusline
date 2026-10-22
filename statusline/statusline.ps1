# Claude Code status line for Windows PowerShell 5.1+ (also runs on PowerShell 7):
# model, activity, context window, 5-hour session and weekly limits.
# Port of statusline.sh: same output. Reads the JSON payload Claude Code sends on stdin.
# Keep this file ASCII only: Windows PowerShell 5.1 reads BOM-less files as ANSI.

$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
try { [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

$raw = [Console]::In.ReadToEnd()
$j = $null
try { $j = $raw | ConvertFrom-Json } catch {}

$Esc = [char]27
function Rgb($r, $g, $b) { return "$Esc[38;2;$r;$g;${b}m" }
$Reset = "$Esc[0m"
$Muted = Rgb 108 112 134
$Text = Rgb 205 214 244
$Mint = Rgb 126 224 181
$Amber = Rgb 245 194 107
$Coral = Rgb 255 107 129
$Lilac = Rgb 180 190 254
$Sep = "  $Muted$([char]0x2502)$Reset  "
$Dash = [string][char]0x2501

function Sym([int]$cp) { return [char]::ConvertFromUtf32($cp) }

if ($env:STATUSLINE_NOW) { $now = [long]$env:STATUSLINE_NOW } else { $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }

function ColorFor([int]$p) {
  if ($p -ge 85) { return $Coral }
  if ($p -ge 60) { return $Amber }
  return $Mint
}

function Bar([int]$p) {
  if ($p -gt 100) { $p = 100 }
  $c = ColorFor $p
  $filled = [int][math]::Floor(($p * 8 + 50) / 100)
  $out = $c
  for ($i = 0; $i -lt 8; $i++) {
    if ($i -eq $filled) { $out += $Muted }
    $out += $Dash
  }
  return "$out$Reset"
}

# Epoch seconds, epoch milliseconds or an ISO timestamp -> "2h13" / "3d" / "42m"; empty when past or unparsable.
function UntilReset($ts) {
  if ($null -eq $ts -or "$ts" -eq '') { return '' }
  $s = "$ts"
  [long]$epoch = 0
  if ($s -match '^[0-9]+(\.[0-9]+)?$') {
    $epoch = [long][math]::Floor([double]::Parse($s, [Globalization.CultureInfo]::InvariantCulture))
    if ($epoch -gt 9999999999) { $epoch = [long][math]::Floor($epoch / 1000) }
  } else {
    $dt = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse($s, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$dt)) { return '' }
    $epoch = $dt.ToUnixTimeSeconds()
  }
  $secs = $epoch - $now
  if ($secs -le 0) { return '' }
  $d = [long][math]::Floor($secs / 86400)
  $h = [long][math]::Floor(($secs % 86400) / 3600)
  $m = [long][math]::Floor(($secs % 3600) / 60)
  if ($d -gt 0) { return "${d}d" }
  if ($h -gt 0) { return ('{0}h{1:00}' -f $h, $m) }
  return "${m}m"
}

function Segment($label, $pct, $resetAt) {
  if ($null -eq $pct) { return '' }
  $left = UntilReset $resetAt
  $out = "$Sep$Muted$label $(Bar $pct) $(ColorFor $pct)$pct%$Reset"
  if ($left -ne '') { $out += " $Muted$left$Reset" }
  return $out
}

# jq's round: halves go away from zero.
function RoundPct($v) {
  if ($null -eq $v -or "$v" -eq '') { return $null }
  return [int][math]::Round([double]$v, [MidpointRounding]::AwayFromZero)
}

$sid = $j.session_id; if (-not $sid) { $sid = 'default' }
$model = $j.model.display_name; if (-not $model) { $model = $j.model.id }; if (-not $model) { $model = 'claude' }
$ctxPct = RoundPct $j.context_window.used_percentage
$ctxSize = $j.context_window.context_window_size; if (-not $ctxSize) { $ctxSize = 200000 }
$u = $j.context_window.current_usage
$ctxUsed = [long]($u.input_tokens) + [long]($u.cache_creation_input_tokens) + [long]($u.cache_read_input_tokens)
$five = RoundPct $j.rate_limits.five_hour.used_percentage
$fiveReset = $j.rate_limits.five_hour.resets_at
$week = RoundPct $j.rate_limits.seven_day.used_percentage
$weekReset = $j.rate_limits.seven_day.resets_at

if ($null -eq $ctxPct -and $ctxUsed -gt 0) { $ctxPct = [int][math]::Floor($ctxUsed * 100 / [double]$ctxSize) }

# Activity, written by statusline-state.ps1 hooks. The status line re-runs every
# second (refreshInterval), so the frame index is simply the current second.
$userHome = [Environment]::GetFolderPath('UserProfile')
$state = ''; $tool = ''; $since = $now
$stateFile = Join-Path (Join-Path (Join-Path $userHome '.claude') 'statusline-state') "$sid"
if (Test-Path -LiteralPath $stateFile) {
  $line = Get-Content -LiteralPath $stateFile -TotalCount 1
  if ($line) {
    $parts = $line -split '\|', 3
    $state = $parts[0]
    if ($parts.Count -gt 1) { $tool = $parts[1] }
    if ($parts.Count -gt 2 -and $parts[2] -match '^[0-9]+$') { $since = [long]$parts[2] }
  }
}
$age = $now - $since

function PickOf($items) { return $items[[int]($now % $items.Count)] }

$activity = ''
switch ($state) {
  'thinking' {
    $verbs = 'thinking', 'pondering', 'brewing', 'scheming', 'conjuring', 'noodling'
    $stars = (Sym 0x2736), (Sym 0x2738), (Sym 0x2739), (Sym 0x273A), (Sym 0x2739), (Sym 0x2738)
    $verb = $verbs[[int]([math]::Floor($now / 4) % $verbs.Count)]
    $activity = "$Lilac$(PickOf $stars) $verb$Reset"
  }
  'tool' {
    if ($tool -in 'Edit', 'Write', 'MultiEdit', 'NotebookEdit') { $label = "$(Sym 0x270E) writing" }
    elseif ($tool -eq 'Bash') { $label = "$(Sym 0x26A1) running" }
    elseif ($tool -in 'Read', 'Grep', 'Glob', 'LS' -or $tool -like 'mcp__codegraph*') { $label = "$(Sym 0x2315) reading" }
    elseif ($tool -in 'Agent', 'Task') { $label = "$(Sym 0x21F6) delegating" }
    elseif ($tool -in 'WebFetch', 'WebSearch') { $label = "$(Sym 0x25CD) browsing" }
    else { $label = "$(Sym 0x2699) working" }
    $spin = 0x280B, 0x2819, 0x2839, 0x2838, 0x283C, 0x2834, 0x2826, 0x2827, 0x2807, 0x280F | ForEach-Object { Sym $_ }
    $activity = "$Mint$label $(PickOf $spin)$Reset"
  }
  'ask' {
    $c = PickOf @($Coral, $Muted)
    $activity = "$c$(Sym 0x25CF) needs you$Reset"
  }
  'done' {
    if ($age -lt 15) {
      $activity = "$Mint$(PickOf @((Sym 0x2713), (Sym 0x2714))) done$Reset"
    } elseif ($age -gt 300) {
      $activity = "$Muted$(Sym 0x1F4A4) $(PickOf @('z  ', 'zZ ', 'zZz'))$Reset"
    }
  }
}

$short = ("$model").ToLowerInvariant() -replace '^claude ', ''
$out = "$Text$short$Reset"
if ($activity -ne '') { $out += " $activity" }
if ($null -ne $ctxPct) { $out += "$Sep${Muted}ctx$Reset $(Bar $ctxPct) $(ColorFor $ctxPct)$ctxPct%$Reset" }
$out += Segment '5h' $five $fiveReset
$out += Segment 'wk' $week $weekReset

[Console]::Out.Write("$out`n")
