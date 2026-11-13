# Runs VidMind from this PC (home internet, so YouTube isn't blocked) and publishes it
# through a free Cloudflare quick tunnel. Safe to run again: it reuses what's already running.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start-public.ps1
#
# The public link changes every time the tunnel restarts. It is printed at the end and
# saved to %LOCALAPPDATA%\VidMind\public-url.txt. Logs live in the same folder.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 8080
$logDir = Join-Path $env:LOCALAPPDATA 'VidMind'
New-Item -ItemType Directory -Force $logDir | Out-Null

function Test-Health {
  try { (Invoke-WebRequest "http://localhost:$port/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { $false }
}

# 1. App server (production build: API + website on one port)
if (-not (Test-Health)) {
  if (-not (Test-Path (Join-Path $root 'server\dist\app.js'))) {
    throw "No build found. Run 'npm run build' in $root first."
  }
  $env:NODE_ENV = 'production'
  $env:PORT = "$port"
  $env:TRUST_PROXY = 'true'   # requests arrive via the tunnel; keeps per-visitor rate limits working
  Start-Process -FilePath 'node' -ArgumentList 'dist/app.js' -WorkingDirectory (Join-Path $root 'server') `
    -WindowStyle Hidden -RedirectStandardOutput "$logDir\server.log" -RedirectStandardError "$logDir\server-error.log"
  for ($i = 0; $i -lt 30 -and -not (Test-Health); $i++) { Start-Sleep -Seconds 1 }
  if (-not (Test-Health)) { throw "Server did not start. See $logDir\server-error.log" }
}
Write-Host "Server running on http://localhost:$port"

# 2. Cloudflare quick tunnel (restarted each run so the saved link is always current)
$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) { $cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
$tunnelLog = Join-Path $logDir 'tunnel.log'
Remove-Item $tunnelLog -ErrorAction SilentlyContinue
Start-Process -FilePath $cloudflared -WindowStyle Hidden `
  -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://localhost:$port", '--logfile', "`"$tunnelLog`"")

$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
}
if (-not $url) { throw "Tunnel did not start. See $tunnelLog" }

Set-Content -Path (Join-Path $logDir 'public-url.txt') -Value $url -Encoding utf8
Write-Host "PUBLIC LINK: $url"
