# Launches the whole stack with one command.
#
#   .\start-all.ps1          quiet: services run hidden, output goes to .\logs
#   .\start-all.ps1 -Show    one visible window per service, for debugging
#
# Quiet is the default because eight console windows are eight windows to close,
# and during a screen recording they are eight windows in the way. Nothing is
# lost: every service writes the same output into .\logs\<name>.log.
#
# This file is deliberately ASCII-only. Windows PowerShell 5.1 reads a BOM-less
# file as ANSI, which corrupts any non-ASCII character in it and breaks parsing
# in a place that looks nothing like the real cause.

param(
    [switch]$Show
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

$services = @(
    @{ Name = 'telegram'; Port = 8201; Dir = 'telegram-service'
       File = '.venv\Scripts\python.exe'; Args = @('-m', 'uvicorn', 'main:app', '--port', '8201', '--reload') }
    @{ Name = 'slack';    Port = 8202; Dir = 'slack-service'
       File = '.venv\Scripts\python.exe'; Args = @('-m', 'uvicorn', 'main:app', '--port', '8202', '--reload') }
    @{ Name = 'discord';  Port = 8203; Dir = 'discord-service'
       File = '.venv\Scripts\python.exe'; Args = @('-m', 'uvicorn', 'main:app', '--port', '8203', '--reload') }
    @{ Name = 'whatsapp'; Port = 8204; Dir = 'whatsapp-service'
       File = 'node';                      Args = @('main.js') }
    @{ Name = 'viber';    Port = 8205; Dir = 'viber-service'
       File = '.venv\Scripts\python.exe'; Args = @('-m', 'uvicorn', 'main:app', '--port', '8205', '--reload') }
    # No --reload for whisper: a reload drops the model out of memory, and
    # loading it back costs tens of seconds.
    @{ Name = 'whisper';  Port = 8206; Dir = 'whisper-service'
       File = '.venv\Scripts\python.exe'; Args = @('-m', 'uvicorn', 'main:app', '--port', '8206') }
    @{ Name = 'backend';  Port = 8279; Dir = 'backend'
       File = '.\gradlew.bat';            Args = @('bootRun') }
    @{ Name = 'frontend'; Port = 5273; Dir = 'frontend'
       File = 'npm.cmd';                   Args = @('run', 'dev') }
)

# --- Things this script does not start, but cannot work without --------------
$pg = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue |
      Where-Object { $_.Status -eq 'Running' }
if ($pg) {
    Write-Host ("postgres : running ({0})" -f $pg[0].Name) -ForegroundColor Green
} else {
    Write-Host "postgres : NOT running - the backend will not start" -ForegroundColor Yellow
}

# A missing Ollama turns every analysis into a silent failure, so name it up front.
try {
    Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -UseBasicParsing -TimeoutSec 3 | Out-Null
    Write-Host "ollama   : running" -ForegroundColor Green
} catch {
    Write-Host "ollama   : NOT running - analysis and semantic search will fail" -ForegroundColor Yellow
}

# --- Free the ports ----------------------------------------------------------
# A service left over from an earlier run keeps its port and its old code, which
# looks exactly like the new code failing.
foreach ($svc in $services) {
    $owners = Get-NetTCPConnection -LocalPort $svc.Port -State Listen -ErrorAction SilentlyContinue |
              Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $owners) {
        $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host ("freeing {0}: stopping {1} ({2})" -f $svc.Port, $proc.ProcessName, $processId) -ForegroundColor DarkYellow
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }
}
Start-Sleep -Milliseconds 700

# --- Start -------------------------------------------------------------------
Write-Host ""
foreach ($svc in $services) {
    $dir = Join-Path $root $svc.Dir
    if (-not (Test-Path $dir)) {
        Write-Host ("skip {0}: {1} not found" -f $svc.Name, $dir) -ForegroundColor Red
        continue
    }

    # Start-Process resolves a relative -FilePath against the caller's directory,
    # not against -WorkingDirectory, so anything inside the service folder has to
    # be made absolute here. Bare names (node, cmd.exe) come from PATH.
    $file = $svc.File
    if ($file -match '[\\/]') { $file = Join-Path $dir $file }

    if ($Show) {
        $line = ($svc.File + ' ' + ($svc.Args -join ' '))
        $inner = "`$host.UI.RawUI.WindowTitle='$($svc.Name) :$($svc.Port)'; $line"
        Start-Process 'powershell' -WorkingDirectory $dir `
            -ArgumentList '-NoProfile', '-NoExit', '-Command', $inner | Out-Null
    } else {
        Start-Process -FilePath $file -ArgumentList $svc.Args -WorkingDirectory $dir `
            -WindowStyle Hidden `
            -RedirectStandardOutput (Join-Path $logs ($svc.Name + '.log')) `
            -RedirectStandardError  (Join-Path $logs ($svc.Name + '.err')) | Out-Null
    }
    Write-Host ("starting {0,-9} :{1}" -f $svc.Name, $svc.Port) -ForegroundColor Cyan
}

# --- Wait until the ports answer ---------------------------------------------
# The backend needs the longest: Gradle, Spring context, schema check.
Write-Host ""
Write-Host "waiting for services (the backend takes the longest)..." -ForegroundColor DarkGray
$deadline = (Get-Date).AddSeconds(150)
$pending = [System.Collections.ArrayList]::new()
$services | ForEach-Object { [void]$pending.Add($_) }

while ($pending.Count -gt 0 -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    foreach ($svc in @($pending)) {
        $up = Get-NetTCPConnection -LocalPort $svc.Port -State Listen -ErrorAction SilentlyContinue
        if ($up) {
            Write-Host ("  up   {0,-9} :{1}" -f $svc.Name, $svc.Port) -ForegroundColor Green
            $pending.Remove($svc)
        }
    }
}
foreach ($svc in $pending) {
    Write-Host ("  DOWN {0,-9} :{1}  see logs\{0}.log" -f $svc.Name, $svc.Port) -ForegroundColor Yellow
}

Write-Host ""
Write-Host "App:     http://localhost:5273" -ForegroundColor Green
Write-Host "Backend: http://localhost:8279" -ForegroundColor Green
Write-Host "Logs:    .\logs\<service>.log     Stop: .\stop-all.ps1"
