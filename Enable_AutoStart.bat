@echo off
title Millora POS - Activer le Demarrage Automatique Windows
color 0A
cd /d "%~dp0"

echo =========================================================
echo   Millora POS - Configuration du Demarrage Automatique
echo =========================================================
echo.

set "SCRIPT_PATH=%~dp0start.bat"
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\Millora_POS.lnk"

echo [*] Creation du raccourci dans le dossier de demarrage Windows...
powershell -NoProfile -Command "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); $Shortcut.TargetPath = '%SCRIPT_PATH%'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.WindowStyle = 7; $Shortcut.Description = 'Lancement automatique de Millora POS'; $Shortcut.Save()"

if exist "%SHORTCUT_PATH%" (
    echo.
    echo [SUCCES] Le demarrage automatique avec Windows est active !
    echo Chaque matin, Millora s'ouvrira automatiquement a l'allumage du PC.
) else (
    echo.
    echo [ERREUR] Impossible de creer le raccourci dans le dossier Startup.
)

echo.
echo Appuyez sur une touche pour quitter...
pause >nul
