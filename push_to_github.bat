@echo off
setlocal enabledelayedexpansion

echo =========================================================
echo  Millora - Automated Git Commit and GitHub Push Script
echo =========================================================
echo.

:: Check if git is available
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git is not installed or not in system PATH.
    pause
    exit /b 1
)

:: Get current branch name
for /f "tokens=*" %%a in ('git rev-parse --abbrev-ref HEAD') do set CURRENT_BRANCH=%%a

if "%CURRENT_BRANCH%"=="" (
    set CURRENT_BRANCH=main
)

echo [*] Detected branch: %CURRENT_BRANCH%

:: Check git status
git status -s > "%TEMP%\git_status.tmp"
set /p STATUS_CHECK=<"%TEMP%\git_status.tmp"
del "%TEMP%\git_status.tmp" 2>nul

if "%STATUS_CHECK%"=="" (
    echo [!] No changes detected in working directory.
    echo [*] Checking for unpushed commits...
    git log origin/%CURRENT_BRANCH%..%CURRENT_BRANCH% --oneline
    echo.
    set /p FORCE_PUSH="Do you want to push existing commits to origin/%CURRENT_BRANCH%? (Y/N): "
    if /i "!FORCE_PUSH!"=="Y" (
        goto do_push
    ) else (
        echo [*] Done.
        exit /b 0
    )
)

:: Prompt or set default commit message
if "%~1"=="" (
    set DEFAULT_COMMIT_MSG=feat(scaniq): implement intelligent offline invoice scanner with Stirling/Paperless architecture
    echo.
    echo Default commit message:
    echo   !DEFAULT_COMMIT_MSG!
    echo.
    set /p USER_MSG="Enter commit message (Press Enter for default): "
    if "!USER_MSG!"=="" (
        set COMMIT_MSG=!DEFAULT_COMMIT_MSG!
    ) else (
        set COMMIT_MSG=!USER_MSG!
    )
) else (
    set COMMIT_MSG=%*
)

echo.
echo [*] Staging all modified and untracked files...
git add -A

echo [*] Committing changes with message:
echo     "!COMMIT_MSG!"
git commit -m "!COMMIT_MSG!"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git commit failed.
    pause
    exit /b 1
)

:do_push
echo.
echo [*] Pushing to remote origin/%CURRENT_BRANCH%...
git push origin %CURRENT_BRANCH%

if %ERRORLEVEL% equ 0 (
    echo.
    echo =========================================================
    echo  [SUCCESS] Changes pushed to GitHub successfully!
    echo =========================================================
) else (
    echo.
    echo [WARNING] Direct push failed. Attempting with upstream tracking...
    git push -u origin %CURRENT_BRANCH%
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [ERROR] Push failed. Please check your network or GitHub credentials/SSH keys.
        pause
        exit /b 1
    )
)

echo.
pause
