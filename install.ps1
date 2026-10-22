# Installer for claude-crew-statusline on Windows (PowerShell 5.1 or newer): a Claude Code
# status line and the subagent crew pane. Counterpart of install.sh, which covers macOS, Linux and WSL.
#
#   irm https://raw.githubusercontent.com/juancho391/claude-crew-statusline/v0.3.1/install.ps1 | iex
#   & ([scriptblock]::Create((irm <url>))) -StatuslineOnly
#   & ([scriptblock]::Create((irm <url>))) -PaneOnly
#   & ([scriptblock]::Create((irm <url>))) -Theme mocha -Background '#1e1e2e'
#   & ([scriptblock]::Create((irm <url>))) -Ref main
#   & ([scriptblock]::Create((irm <url>))) -Uninstall
#
# Never overwrites settings.json: it backs it up once and edits only its own entries.
# Environment: CREW_REF (branch or tag, default v0.3.1), CREW_SRC (local checkout, for testing).
# Keep this file ASCII only: Windows PowerShell 5.1 reads BOM-less files as ANSI.

param(
  [switch]$Uninstall,
  [switch]$StatuslineOnly,
  [switch]$PaneOnly,
  [string]$Theme = '',
  [string]$Background = '',
  [string]$Ref = '',
  [int]$RefreshInterval = 1
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$Repo = 'juancho391/claude-crew-statusline'
$PluginKey = 'subagent-crew@inline'
$Themes = 'warp', 'midnight', 'mocha', 'light'
if (-not $Ref) { if ($env:CREW_REF) { $Ref = $env:CREW_REF } else { $Ref = 'v0.3.1' } }

function Say($m) { Write-Host $m }

function Test-Prop($o, $name) { return (@($o.PSObject.Properties.Name) -contains $name) }

function Set-Prop($o, $name, $value) {
  if (Test-Prop $o $name) { $o.$name = $value } else { $o | Add-Member -NotePropertyName $name -NotePropertyValue $value }
}

function Remove-Prop($o, $name) { [void]$o.PSObject.Properties.Remove($name) }

function Count-Props($o) { return @($o.PSObject.Properties).Count }

# The object stored under $name, created (or replaced, when it holds something else) when missing.
function Get-Obj($o, $name) {
  if (-not (Test-Prop $o $name) -or ($o.$name -isnot [pscustomobject])) { Set-Prop $o $name ([pscustomobject]@{}) }
  return $o.$name
}

function Get-Json($o) { return ($o | ConvertTo-Json -Depth 32 -Compress) }

function Install-Main {
  if ($StatuslineOnly -and $PaneOnly) { throw '-StatuslineOnly and -PaneOnly cancel out: nothing to do.' }
  if ($Theme -and ($Themes -notcontains $Theme)) { throw "unknown theme: $Theme (choose one of: $($Themes -join ' '))" }
  if ($Background -and ($Background -notmatch '^#[0-9a-fA-F]{6}$')) { throw "-Background must be #RRGGBB, got: $Background" }
  if (($Theme -or $Background) -and $StatuslineOnly) { throw '-Theme and -Background configure the pane; drop -StatuslineOnly.' }
  $doStatus = -not $PaneOnly
  $doPane = -not $StatuslineOnly

  $userHome = [Environment]::GetFolderPath('UserProfile')
  $claude = Join-Path $userHome '.claude'
  $claudeFwd = $claude -replace '\\', '/'   # forward slashes survive both Git Bash and PowerShell
  $settingsPath = Join-Path $claude 'settings.json'
  $backupPath = Join-Path $claude 'settings.json.bak-crew-statusline'
  $pluginDir = "$claudeFwd/mods/subagent-crew"
  $utf8 = New-Object System.Text.UTF8Encoding($false)

  New-Item -ItemType Directory -Force -Path $claude | Out-Null
  if (-not (Test-Path -LiteralPath $settingsPath)) { [IO.File]::WriteAllText($settingsPath, "{}`n", $utf8) }
  $settings = $null
  try { $settings = [IO.File]::ReadAllText($settingsPath) | ConvertFrom-Json } catch { throw "$settingsPath is not valid JSON; fix it first." }
  if ($null -eq $settings) { $settings = [pscustomobject]@{} }

  function Save-Settings {
    $json = Get-Json $settings
    [void]($json | ConvertFrom-Json)   # refuse to write anything that does not parse back
    $pretty = $settings | ConvertTo-Json -Depth 32
    [IO.File]::WriteAllText($settingsPath, "$pretty`n", $utf8)
  }
  function Backup-Settings {
    if (-not (Test-Path -LiteralPath $backupPath)) {
      Copy-Item -LiteralPath $settingsPath -Destination $backupPath
      Say "Backed up settings to $backupPath"
    }
  }

  if ($Uninstall) {
    Backup-Settings
    if ($doStatus) {
      foreach ($f in 'statusline.ps1', 'statusline-state.ps1') { Remove-Item -LiteralPath (Join-Path $claude $f) -Force -ErrorAction SilentlyContinue }
      Remove-Item -LiteralPath (Join-Path $claude 'statusline-state') -Recurse -Force -ErrorAction SilentlyContinue
      if (Test-Prop $settings 'hooks') {
        $hooks = $settings.hooks
        foreach ($ev in @($hooks.PSObject.Properties.Name)) {
          $kept = @(@($hooks.$ev) | Where-Object { (Get-Json $_) -notmatch 'statusline-state\.ps1' })
          if ($kept.Count -eq 0) { Remove-Prop $hooks $ev } else { $hooks.$ev = $kept }
        }
        if ((Count-Props $hooks) -eq 0) { Remove-Prop $settings 'hooks' }
      }
      if ((Test-Prop $settings 'statusLine') -and ((Get-Json $settings.statusLine) -match 'statusline\.ps1')) { Remove-Prop $settings 'statusLine' }
    }
    if ($doPane) {
      Remove-Item -LiteralPath (Join-Path $claude 'mods/subagent-crew') -Recurse -Force -ErrorAction SilentlyContinue
      $modsDir = Join-Path $claude 'mods'
      if ((Test-Path -LiteralPath $modsDir) -and -not (Get-ChildItem -LiteralPath $modsDir -Force)) { Remove-Item -LiteralPath $modsDir -Force }
      if ((Test-Prop $settings 'env') -and ($settings.env -is [pscustomobject]) -and (Test-Prop $settings.env 'CLAUDE_CODE_PLUGIN_DIRS') -and ($settings.env.CLAUDE_CODE_PLUGIN_DIRS -eq $pluginDir)) {
        Remove-Prop $settings.env 'CLAUDE_CODE_PLUGIN_DIRS'
        if ((Count-Props $settings.env) -eq 0) { Remove-Prop $settings 'env' }
      }
      if ((Test-Prop $settings 'pluginConfigs') -and ($settings.pluginConfigs -is [pscustomobject])) {
        Remove-Prop $settings.pluginConfigs $PluginKey
        if ((Count-Props $settings.pluginConfigs) -eq 0) { Remove-Prop $settings 'pluginConfigs' }
      }
    }
    Save-Settings
    Say 'Uninstalled. Restart Claude Code for it to take effect.'
    return
  }

  # --- fetch the sources
  $tmp = $null
  if ($env:CREW_SRC) {
    $src = $env:CREW_SRC
  } else {
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('crew-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $zip = Join-Path $tmp 'src.zip'
    $got = $false
    # A tagged release ships its own archive as a release asset (GitHub counts those downloads);
    # a branch, or a tag without the asset, comes from the plain source archive.
    if ($Ref -match '^v[0-9]') {
      Say "Downloading release $Ref"
      try { Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/$Repo/releases/download/$Ref/claude-crew-statusline-$Ref.zip" -OutFile $zip; $got = $true } catch {}
    }
    if (-not $got) {
      Say "Downloading $Repo@$Ref"
      try { Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$Repo/zip/$Ref" -OutFile $zip } catch { throw "could not download $Repo@$Ref (check the ref name and your connection)." }
    }
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $tmp 'x') -Force
    $src = (Get-ChildItem -LiteralPath (Join-Path $tmp 'x') -Directory | Select-Object -First 1).FullName
  }
  try {
    if (-not (Test-Path -LiteralPath (Join-Path $src 'statusline/statusline.ps1'))) { throw "$src does not look like this repo." }
    Backup-Settings

    if ($doStatus) {
      Copy-Item -LiteralPath (Join-Path $src 'statusline/statusline.ps1'), (Join-Path $src 'statusline/statusline-state.ps1') -Destination $claude -Force
      $current = ''
      if ((Test-Prop $settings 'statusLine') -and (Test-Prop $settings.statusLine 'command')) { $current = [string]$settings.statusLine.command }
      if ($current -and ($current -notmatch 'statusline\.ps1')) { Say "Replacing your existing statusLine ($current); the backup keeps it." }
      $run = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$claudeFwd/statusline.ps1`""
      Set-Prop $settings 'statusLine' ([pscustomobject]@{ type = 'command'; command = $run; padding = 0; refreshInterval = $RefreshInterval })
      $hooks = Get-Obj $settings 'hooks'
      $events = [ordered]@{ UserPromptSubmit = 'prompt'; PreToolUse = 'pre-tool'; PostToolUse = 'post-tool'; Notification = 'notify'; Stop = 'stop' }
      foreach ($ev in $events.Keys) {
        $existing = @()
        if (Test-Prop $hooks $ev) { $existing = @($hooks.$ev) }
        if ($existing.Count -gt 0 -and ((Get-Json $existing) -match 'statusline-state\.ps1')) { continue }
        $cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$claudeFwd/statusline-state.ps1`" $($events[$ev])"
        # async: the state write must never delay a tool call (PowerShell takes a moment to start).
        $entry = [pscustomobject]@{ hooks = @([pscustomobject]@{ type = 'command'; command = $cmd; timeout = 5; async = $true }) }
        Set-Prop $hooks $ev (@($existing) + @($entry))
      }
      Save-Settings
      Say 'Installed the status line.'
    }

    if ($doPane) {
      New-Item -ItemType Directory -Force -Path (Join-Path $claude 'mods') | Out-Null
      $paneDest = Join-Path $claude 'mods/subagent-crew'
      Remove-Item -LiteralPath $paneDest -Recurse -Force -ErrorAction SilentlyContinue
      Copy-Item -LiteralPath (Join-Path $src 'mods/subagent-crew') -Destination (Join-Path $claude 'mods') -Recurse -Force
      $envObj = Get-Obj $settings 'env'
      $currentDirs = ''
      if (Test-Prop $envObj 'CLAUDE_CODE_PLUGIN_DIRS') { $currentDirs = [string]$envObj.CLAUDE_CODE_PLUGIN_DIRS }
      if (-not $currentDirs -or $currentDirs -eq $pluginDir) {
        Set-Prop $envObj 'CLAUDE_CODE_PLUGIN_DIRS' $pluginDir
        Say 'Installed the crew pane.'
      } else {
        Say 'Installed the crew pane files, but CLAUDE_CODE_PLUGIN_DIRS is already set to:'
        Say "  $currentDirs"
        Say "Not changing it. Add $pluginDir to it yourself, then restart Claude Code."
      }
      if ($Theme -or $Background) {
        $options = Get-Obj (Get-Obj (Get-Obj $settings 'pluginConfigs') $PluginKey) 'options'
        if ($Theme) { Set-Prop $options 'theme' $Theme; Say "Pane theme: $Theme" }
        if ($Background) { Set-Prop $options 'background' $Background; Say "Pane background: $Background" }
      }
      Save-Settings
    }

    if ($doPane) { Say 'Done. Restart Claude Code, then run /crew to open the Agents pane.' }
    else { Say 'Done. Restart Claude Code to see the status line.' }
  } finally {
    if ($tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

try {
  Install-Main
} catch {
  Write-Host "error: $($_.Exception.Message)" -ForegroundColor Red
  # `exit` would close the user's shell when this runs through `irm | iex`; only a script file may exit.
  if ($PSCommandPath) { exit 1 }
}
