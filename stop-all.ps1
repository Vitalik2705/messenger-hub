# Stops everything start-all.ps1 launched, by port rather than by window.
#
#   powershell -ExecutionPolicy Bypass -File .\stop-all.ps1

# 8206 is whisper: it holds the speech model in memory, so leaving it running
# after everything else looks like a free machine and is not one.
$ports = 8201, 8202, 8203, 8204, 8205, 8206, 8279, 5273

foreach ($port in $ports) {
    $owners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
              Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $owners) {
        Write-Host "$port : free"
        continue
    }
    foreach ($processId in $owners) {
        $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            Write-Host "$port : stopped $($proc.ProcessName) ($processId)" -ForegroundColor DarkYellow
        }
    }
}
