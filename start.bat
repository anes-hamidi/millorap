@echo off
title Millora - Demarrage
color 0A
echo.
echo  =========================================
echo   Millora Print ^& POS - Demarrage
echo  =========================================
echo.

:: Load .env variables
for /F "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "line=%%A"
    if not "!line:~0,1!"=="#" (
        set "%%A=%%B"
    )
)
:: Re-load with delayed expansion workaround
for /F "usebackq tokens=1,* delims==" %%A in (".env") do (
    echo %%A | findstr /V "^#" >nul 2>&1 && set "%%A=%%B"
)

setlocal enabledelayedexpansion

:: Re-load .env with delayed expansion active
for /F "usebackq tokens=1,* delims==" %%A in (".env") do (
    set "key=%%A"
    set "val=%%B"
    set "first=!key:~0,1!"
    if not "!first!"=="#" if not "!key!"=="" (
        set "!key!=!val!"
    )
)

:: Kill old processes
echo [1/4] Arret des anciens processus...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM ngrok.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Check ngrok exists
if not exist "ngrok.exe" (
    echo [!] ngrok.exe non trouve dans ce dossier.
    echo     Telechargement en cours...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile 'ngrok.zip'; Expand-Archive -Path 'ngrok.zip' -DestinationPath '.' -Force; Remove-Item 'ngrok.zip'"
    if not exist "ngrok.exe" (
        echo [!] Telechargement echoue. Mode local uniquement.
        goto :start_server
    )
    echo [OK] ngrok.exe telecharge.
)

:: Set auth token
if defined NGROK_TOKEN (
    if not "!NGROK_TOKEN!"=="" (
        echo [2/4] Configuration du token ngrok...
        .\ngrok.exe config add-authtoken !NGROK_TOKEN! >nul 2>&1
        echo [OK] Token configure.
    )
)

:: Start tunnel
echo [3/4] Demarrage du tunnel ngrok...
if defined NGROK_DOMAIN (
    if not "!NGROK_DOMAIN!"=="" (
        echo      Mode : Domaine permanent ^(!NGROK_DOMAIN!^)
        start /B .\ngrok.exe http --url=!NGROK_DOMAIN! 3000 --log=stdout > "%TEMP%\millora_ngrok.log" 2>&1
    ) else (
        echo      Mode : URL aleatoire ^(obtenir un domaine permanent sur dashboard.ngrok.com^)
        start /B .\ngrok.exe http 3000 --log=stdout > "%TEMP%\millora_ngrok.log" 2>&1
    )
) else (
    start /B .\ngrok.exe http 3000 --log=stdout > "%TEMP%\millora_ngrok.log" 2>&1
)

:: Wait for ngrok to start and get URL via local API
echo [4/4] Detection de l URL publique...
set "PUBLIC_URL="
for /L %%i in (1,1,20) do (
    timeout /t 1 /nobreak >nul
    if not defined PUBLIC_URL (
        for /F "delims=" %%U in ('powershell -NoProfile -Command "try { $r = Invoke-RestMethod http://localhost:4040/api/tunnels -ErrorAction Stop; $r.tunnels[0].public_url } catch {}"') do (
            if not "%%U"=="" set "PUBLIC_URL=%%U"
        )
    )
)

if not defined PUBLIC_URL (
    echo [!] ngrok non demarre. Mode local Wi-Fi uniquement.
    powershell -NoProfile -Command "$c = (Get-Content '.env' -Raw) -replace '(?m)^PUBLIC_URL=.*(\r?\n)?',''; Set-Content '.env' $c.TrimEnd()"
    goto :start_server
)

echo [OK] URL publique : !PUBLIC_URL!

:: Save URL to .env
powershell -NoProfile -Command "$url = '!PUBLIC_URL!'; $c = Get-Content '.env' -Raw; if ($c -match '(?m)^PUBLIC_URL=') { $c = $c -replace '(?m)^PUBLIC_URL=.*', \"PUBLIC_URL=$url\" } else { $c = $c.TrimEnd() + [Environment]::NewLine + \"PUBLIC_URL=$url\" }; Set-Content '.env' $c.TrimEnd()"

echo.
echo  +--------------------------------------------------+
echo  ^|  URL PUBLIQUE (QR Code Mobile) :                 ^|
echo  ^|  !PUBLIC_URL!
echo  +--------------------------------------------------+
echo.

:start_server
echo  Millora demarre sur http://localhost:3000
echo  Ctrl+C pour arreter.
echo.
node server.js
pause

