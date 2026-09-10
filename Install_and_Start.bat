@echo off
setlocal enabledelayedexpansion
title Millora POS - Setup and Launcher

echo ===================================================
echo           MILLORA POS - ONE-CLICK INSTALLER
echo ===================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this computer!
    echo.
    echo Please download and install Node.js from:
    echo https://nodejs.org/
    echo.
    echo Press any key to open the Node.js download website in your browser...
    pause >nul
    start https://nodejs.org/
    exit /b 1
)

echo [OK] Node.js detected:
node -v
npm -v
echo.

:: 2. Check if node_modules exists, install dependencies if missing
if not exist "node_modules" (
    echo [INFO] First time setup: Installing dependencies...
    echo Please wait a moment...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install dependencies. Please check your internet connection.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully!
    echo.
) else (
    echo [OK] Dependencies already installed.
    echo.
)

:: 3. Launch browser and start server
echo ===================================================
echo  Starting Millora POS at http://localhost:3000 ...
echo  Keep this window open while using the application.
echo ===================================================
echo.

:: Open browser after 2 seconds in background
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

:: Start the application
node server.js

pause
