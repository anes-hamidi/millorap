@echo off
title Millora POS - Build Desktop Installer (.msi / .exe)
color 0B
echo =========================================================
echo       MILLORA DESKTOP - STANDALONE INSTALLER BUILDER
echo =========================================================
echo.

:: 1. Check if Rust is installed
where rustc >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Rust is not installed on this machine.
    echo.
    echo Please install Rust from https://rustup.rs/
    echo 1. Download rustup-init.exe
    echo 2. Run it and press '1' for default installation
    echo 3. Re-run this script after installation.
    echo.
    echo Opening https://rustup.rs in your browser...
    start https://rustup.rs
    pause
    exit /b 1
)

echo [1/3] Checking Rust and Node environment...
rustc --version
cargo --version
node -v
echo.

:: 2. Install Tauri CLI if needed
echo [2/3] Preparing Tauri build system...
where tauri >nul 2>nul
if %errorlevel% neq 0 (
    echo Installing @tauri-apps/cli locally...
    call npm install --save-dev @tauri-apps/cli@2.0.0
)

:: 3. Build standalone installer
echo.
echo [3/3] Building Windows Desktop Installer (.msi / .exe)...
echo This may take 2-4 minutes on the first build...
echo.
call npx tauri build

if %errorlevel% equ 0 (
    echo.
    echo =========================================================
    echo  [SUCCESS] Standalone Installer Created Successfully!
    echo =========================================================
    echo.
    echo Output directory:
    echo src-tauri\target\release\bundle\msi\
    echo.
    explorer src-tauri\target\release\bundle\msi\
) else (
    echo.
    echo [ERROR] Build failed. Please inspect the error messages above.
)

pause
