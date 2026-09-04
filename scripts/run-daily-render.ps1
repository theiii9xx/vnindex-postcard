# Runs the daily VN-Index postcard render and logs the result.
# Invoked by a Windows Task Scheduler task (see scripts/setup-task.ps1).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Task Scheduler runs with a minimal environment; make sure Node/npm are on PATH.
$nodeDir = "C:\Program Files\nodejs"
if ($env:Path -notlike "*$nodeDir*") {
    $env:Path = "$nodeDir;$env:Path"
}

$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile = Join-Path $logDir "render-$timestamp.log"

try {
    # Run non-terminating here: native child-process stderr (e.g. harmless Node
    # deprecation warnings) must not be promoted into a PowerShell terminating
    # error just because it's on stream 2. Check $LASTEXITCODE instead.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    npm run render *>&1 | Tee-Object -FilePath $logFile
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $prevEap

    if ($exitCode -ne 0) {
        Add-Content -Path $logFile -Value "`n[$(Get-Date)] FAILED: npm run render exited with code $exitCode"
        exit 1
    }

    Add-Content -Path $logFile -Value "`n[$(Get-Date)] SUCCESS"
} catch {
    Add-Content -Path $logFile -Value "`n[$(Get-Date)] FAILED: $_"
    throw
}
