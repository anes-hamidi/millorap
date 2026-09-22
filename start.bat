@echo off
title Millora - Demarrage
color 0A
cd /d "%~dp0"
echo.
echo  =========================================
echo   Millora Print ^& POS - Demarrage
echo  =========================================
echo.

setlocal enabledelayedexpansion

:: Kill old processes
echo [1/4] Arret des anciens processus...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Check or download cloudflared
echo [2/4] Verification de Cloudflare Tunnel (cloudflared)...
where cloudflared.exe >nul 2>&1
if %errorlevel% neq 0 (
    if not exist "cloudflared.exe" (
        echo [!] cloudflared.exe non trouve.
        echo     Telechargement en cours depuis Cloudflare...
        powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
        if not exist "cloudflared.exe" (
            echo [!] Echec du telechargement. Mode local uniquement.
            goto :start_server
        )
        echo [OK] cloudflared.exe telecharge.
    )
    set "CF_EXE=.\cloudflared.exe"
) else (
    set "CF_EXE=cloudflared.exe"
)

:: Clear previous log file
set "LOG_FILE=%TEMP%\millora_cloudflared.log"
if exist "%LOG_FILE%" del /F /Q "%LOG_FILE%" >nul 2>&1

:: Start Cloudflare tunnel in background
echo [3/4] Demarrage du tunnel Cloudflare...
start /B "" %CF_EXE% tunnel --url http://localhost:3000 --no-autoupdate > "%LOG_FILE%" 2>&1

:: Wait for tunnel URL in log
echo [4/4] Detection de l URL publique Cloudflare...
set "PUBLIC_URL="
for /L %%i in (1,1,25) do (
    timeout /t 1 /nobreak >nul
    if not defined PUBLIC_URL (
        for /F "delims=" %%U in ('powershell -NoProfile -Command "if (Test-Path '%LOG_FILE%') { $match = Select-String -Path '%LOG_FILE%' -Pattern 'https://[a-zA-Z0-9-]+\.trycloudflare\.com'; if ($match) { $match.Matches[0].Value } }"') do (
            if not "%%U"=="" set "PUBLIC_URL=%%U"
        )
    )
)

if not defined PUBLIC_URL (
    echo [!] Tunnel Cloudflare non detecte ou hors ligne. Mode local Wi-Fi.
    powershell -NoProfile -Command "$c = (Get-Content '.env' -Raw) -replace '(?m)^PUBLIC_URL=.*(\r?\n)?',''; Set-Content '.env' $c.TrimEnd()"
    goto :start_server
)

echo [OK] URL publique : !PUBLIC_URL!

:: Save URL to .env
powershell -NoProfile -Command "$url = '!PUBLIC_URL!'; $c = Get-Content '.env' -Raw; if ($c -match '(?m)^PUBLIC_URL=') { $c = $c -replace '(?m)^PUBLIC_URL=.*', \"PUBLIC_URL=$url\" } else { $c = $c.TrimEnd() + [Environment]::NewLine + \"PUBLIC_URL=$url\" }; Set-Content '.env' $c.TrimEnd()"

echo.
echo  +-------------------------------------------------------------+
echo  ^|  URL PUBLIQUE DIRECTE (Sans avertissement mobile) :         ^|
echo  ^|  !PUBLIC_URL!
echo  +-------------------------------------------------------------+
echo.

:start_server
echo  Millora demarre sur http://localhost:3000
echo  Ctrl+C pour arreter.
echo.

:: Ouvrir automatiquement l'application dans le navigateur (Mode Application PWA)
start "" cmd /c "timeout /t 2 /nobreak >nul & start msedge --app=http://localhost:3000 2>nul || start http://localhost:3000"

node server.js
pause

