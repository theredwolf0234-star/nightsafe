# SafeRoute.AI - PowerShell Server Launcher
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SafeRoute.AI - Night Travel Guardian Server" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan

$pyPath = "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"

if (Test-Path $pyPath) {
    Write-Host "[OK] Using Python 3.12 at $pyPath" -ForegroundColor Green
    Start-Process "http://localhost:5000"
    & $pyPath "backend/server.py" 5000
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    Write-Host "[OK] Using system python" -ForegroundColor Green
    Start-Process "http://localhost:5000"
    python backend/server.py 5000
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    Write-Host "[OK] Using py launcher" -ForegroundColor Green
    Start-Process "http://localhost:5000"
    py -3 backend/server.py 5000
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "[OK] Using node.js" -ForegroundColor Green
    Start-Process "http://localhost:5000"
    node backend/server.js
} else {
    Write-Host "[!] Launching direct browser view..." -ForegroundColor Yellow
    Start-Process "index.html"
}
