<#
  Merlotic stack control - manage the watchdog daemon (backend :3000 + frontend :5173).

  Usage:
    .\daemon\stack.ps1 start     # clear stop-flag and launch watchdog (it brings up backend/frontend)
    .\daemon\stack.ps1 stop      # KILL EVERYTHING: set stop-flag, kill watchdog, backend, frontend
    .\daemon\stack.ps1 status    # show state
    .\daemon\stack.ps1 restart   # stop + start

  "stop" sets the watchdog.stop flag - while it exists the watchdog will NOT bring
  services up (even if relaunched by Task Scheduler). "start" clears the flag.
#>

param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status', 'restart')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'SilentlyContinue'
$DaemonDir   = $PSScriptRoot
$Watchdog    = Join-Path $DaemonDir 'watchdog.js'
$StopFlag    = Join-Path $DaemonDir 'watchdog.stop'
$SelfPid     = Join-Path $DaemonDir 'watchdog.self.pid'
$BackendPid  = Join-Path $DaemonDir 'backend.pid'
$FrontendPid = Join-Path $DaemonDir 'frontend.pid'
$OutLog      = Join-Path $DaemonDir 'watchdog.out.log'
$ErrLog      = Join-Path $DaemonDir 'watchdog.err.log'

function Test-Health([string]$url) {
  try {
    $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
    return $true
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -lt 500) { return $true }
    return $false
  }
}

function Get-PidFrom([string]$file) {
  if (Test-Path $file) { return [int](Get-Content $file -ErrorAction SilentlyContinue | Select-Object -First 1) }
  return $null
}

function Test-Pid([int]$processId) {
  if (-not $processId) { return $false }
  return [bool](Get-Process -Id $processId -ErrorAction SilentlyContinue)
}

function Stop-Tree([int]$processId, [string]$label) {
  if (Test-Pid $processId) {
    Write-Host "  kill $label (PID=$processId)"
    & taskkill /PID $processId /T /F *> $null
  }
}

function Stop-Port([int]$port, [string]$label) {
  $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($p in $pids) { if ($p) { Write-Host "  kill $label on :$port (PID=$p)"; & taskkill /PID $p /T /F *> $null } }
}

function Do-Start {
  if (Test-Path $StopFlag) { Remove-Item $StopFlag -Force; Write-Host "stop-flag cleared" }

  $wd = Get-PidFrom $SelfPid
  if (Test-Pid $wd) { Write-Host "watchdog already running (PID=$wd)"; return }

  $node = (Get-Command node -ErrorAction Stop).Source
  $p = Start-Process -FilePath $node -ArgumentList "`"$Watchdog`"" `
        -WorkingDirectory $DaemonDir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog
  Set-Content -Path $SelfPid -Value $p.Id
  Write-Host ("OK watchdog started (PID={0}); it will bring up backend :3000 and frontend :5173." -f $p.Id) -ForegroundColor Green
  Write-Host ("   log: {0}" -f (Join-Path $DaemonDir 'watchdog.log'))
}

function Do-Stop {
  # 1) set flag so watchdog (even if relaunched by Task Scheduler) will not bring services up
  Set-Content -Path $StopFlag -Value (Get-Date -Format o)
  Write-Host "stop-flag set (watchdog.stop) - auto-restart disabled"

  # 2) kill watchdog
  Stop-Tree (Get-PidFrom $SelfPid) 'watchdog'
  Remove-Item $SelfPid -Force -ErrorAction SilentlyContinue

  # 3) kill backend and frontend (by pid files + by port as fallback)
  Stop-Tree (Get-PidFrom $BackendPid)  'backend'
  Stop-Tree (Get-PidFrom $FrontendPid) 'frontend'
  Remove-Item $BackendPid, $FrontendPid -Force -ErrorAction SilentlyContinue
  Stop-Port 3000 'backend'
  Stop-Port 5173 'frontend'

  Write-Host "OK everything stopped. To start again: .\daemon\stack.ps1 start" -ForegroundColor Yellow
}

function Do-Status {
  $flag = Test-Path $StopFlag
  $wd   = Get-PidFrom $SelfPid
  $flagTxt = if ($flag) { 'SET (auto-restart OFF)' } else { 'none' }
  $wdTxt   = if (Test-Pid $wd) { "running (PID=$wd)" } else { 'not running' }
  $beTxt   = if (Test-Health 'http://localhost:3000/') { 'UP' } else { 'DOWN' }
  $feTxt   = if (Test-Health 'http://localhost:5173/') { 'UP' } else { 'DOWN' }
  Write-Host "-- Merlotic stack --"
  Write-Host ("stop-flag    : {0}" -f $flagTxt)
  Write-Host ("watchdog     : {0}" -f $wdTxt)
  Write-Host ("backend 3000 : {0}" -f $beTxt)
  Write-Host ("frontend 5173: {0}" -f $feTxt)
}

switch ($Action) {
  'start'   { Do-Start }
  'stop'    { Do-Stop }
  'restart' { Do-Stop; Start-Sleep -Seconds 2; Do-Start }
  'status'  { Do-Status }
}
