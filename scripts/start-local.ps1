$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $repo ".local-logs"
$outputLog = Join-Path $logDirectory "server.log"
$errorLog = Join-Path $logDirectory "server-error.log"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$mutex = New-Object System.Threading.Mutex($false, "Local\PrincetonMealExchangeWatchdog")
if (-not $mutex.WaitOne(0, $false)) {
  exit 0
}

try {
  while ($true) {
    $listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if (-not $listening) {
      Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev") `
        -WorkingDirectory $repo `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outputLog `
        -RedirectStandardError $errorLog
      Start-Sleep -Seconds 10
    }
    Start-Sleep -Seconds 15
  }
}
finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
