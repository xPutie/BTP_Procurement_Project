$ErrorActionPreference = "Stop"

$port = 4004

Write-Host "[local-db] Preparing CAP server on port $port..."

$listeners = @()
try {
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
} catch {
    $listeners = @()
}

if ($listeners.Count -gt 0) {
    $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
        if ($procId -and $procId -ne $PID) {
            Write-Host "[local-db] Stopping process using port ${port}: PID $procId"
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "[local-db] Starting CAP with SQLite database db/procurement.db..."
npx cds serve --port $port
exit $LASTEXITCODE
