@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title EXLFY - כיבוי מנוע כתב כמויות

echo.
echo ========================================
echo   EXLFY - כיבוי מנוע כתב כמויות
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy\takeoff-boq-engine.ps1" -Action Stop
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
  echo [שגיאה] הכיבוי נכשל ^(קוד %RC%^).
  echo.
  pause
  exit /b %RC%
)

pause
exit /b 0