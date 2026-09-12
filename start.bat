@echo off
title Millora - Demarrage automatique
color 0A

echo.
echo  Millora Print ^& POS - Demarrage
echo  =====================================
echo.

:: Kill any existing node or cloudflared
echo [1/4] Arret des anciens processus...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM cloudflared.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Check if cloudflared.exe exists locally or in PATH
if exist "cloudflared.exe" goto :have_cloudflared
where cloudflared >nul 2>&1
if %errorlevel% equ 0 goto :have_cloudflared

echo [!] cloudflared non trouve. Telechargement...
curl -L -o cloudflared.exe "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
if %errorlevel% neq 0 (
    echo [!] Telechargement echoue - mode local uniquement.
    goto :start_server
)
echo [OK] cloudflared telecharge.

:have_cloudflared
echo [2/4] Demarrage du tunnel Cloudflare...
set "TUNNEL_LOG=%TEMP%\millora_tunnel.log"
if exist cloudflared.exe (
    start /B cloudflared.exe tunnel --url http://localhost:3000 --no-autoupdate > "%TUNNEL_LOG%" 2>&1
) else (
    start /B cloudflared tunnel --url http://localhost:3000 --no-autoupdate > "%TUNNEL_LOG%" 2>&1
)

echo [3/4] Detection de l URL publique (jusqu a 20 secondes)...
set "PUBLIC_URL="
for /L %%i in (1,1,20) do (
    timeout /t 1 /nobreak >nul
    if not defined PUBLIC_URL (
        for /F "delims=" %%U in ('powershell -NoProfile -Command "try { $t = Get-Content \"%TUNNEL_LOG%\" -ErrorAction Stop; $m = ($t -join ' ') | Select-String 'https://[a-z0-9-]+\.trycloudflare\.com'; if ($m) { $m.Matches[0].Value } } catch {}"') do (
            if not "%%U"=="" set "PUBLIC_URL=%%U"
        )
    )
)

if not defined PUBLIC_URL (
    echo [!] Tunnel non detecte - demarrage en mode local Wi-Fi.
    powershell -NoProfile -Command "$c = Get-Content '.env' -Raw; $c = $c -replace '(?m)^PUBLIC_URL=.*\r?\n?',''; Set-Content '.env' $c.Trim()"
    goto :start_server
)

echo [OK] URL publique : %PUBLIC_URL%
echo [4/4] Mise a jour de .env ...
powershell -NoProfile -Command "$c = Get-Content '.env' -Raw; if ($c -match '(?m)^PUBLIC_URL=') { $c = $c -replace '(?m)^PUBLIC_URL=.*', 'PUBLIC_URL=%PUBLIC_URL%' } else { $c = $c.TrimEnd() + [Environment]::NewLine + 'PUBLIC_URL=%PUBLIC_URL%' }; Set-Content '.env' $c.TrimEnd()"
echo [OK] .env mis a jour.

echo.
echo  +-------------------------------------------------+
echo  ^| URL Publique (QR Mobile) :                      ^|
echo  ^| %PUBLIC_URL%
echo  +-------------------------------------------------+
echo.

:start_server
echo  Demarrage Millora sur http://localhost:3000 ...
echo  Ctrl+C pour arreter.
echo.
node server.js
pause
