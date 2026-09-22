@echo off
title Millora POS - Desactiver le Demarrage Automatique Windows
color 0C
cd /d "%~dp0"

echo =========================================================
echo   Millora POS - Desactivation du Demarrage Automatique
echo =========================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\Millora_POS.lnk"

if exist "%SHORTCUT_PATH%" (
    del /F /Q "%SHORTCUT_PATH%"
    echo [SUCCES] Le raccourci de demarrage automatique a ete supprime.
    echo Millora ne se lancera plus automatiquement au demarrage de Windows.
) else (
    echo [INFO] Le demarrage automatique n'etait pas active.
)

echo.
echo Appuyez sur une touche pour quitter...
pause >nul
