$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $repo ".local-logs"
$outputLog = Join-Path $logDirectory "server.log"
$errorLog = Join-Path $logDirectory "server-error.log"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  exit 0
}

Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev") `
  -WorkingDirectory $repo `
  -WindowStyle Hidden `
  -RedirectStandardOutput $outputLog `
  -RedirectStandardError $errorLog
