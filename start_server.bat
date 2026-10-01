@echo off
title SafeRoute.AI - Night Travel Guardian Server
echo ============================================================
echo   Starting SafeRoute.AI Full-Stack Server & AI Risk Engine
echo ============================================================
echo.

where py >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Python Launcher detected. Launching server...
    start http://localhost:5000
    py -3 backend/server.py 5000
    goto end
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Python detected. Launching server...
    start http://localhost:5000
    python backend/server.py 5000
    goto end
)

if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    echo [OK] Python 3.12 detected in LocalAppData. Launching server...
    start http://localhost:5000
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" backend/server.py 5000
    goto end
)

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node.js detected. Launching backend/server.js...
    start http://localhost:5000
    node backend/server.js
    goto end
)

echo [!] Neither Python nor Node.js found in standard PATH.
echo Opening index.html directly in browser...
start index.html

:end
pause
