@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title EXLFY - הפעלת מנוע כתב כמויות

echo.
echo ========================================
echo   EXLFY - הפעלת מנוע כתב כמויות
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy\takeoff-boq-engine.ps1" -Action Start
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
  echo [שגיאה] ההפעלה נכשלה ^(קוד %RC%^).
  echo.
  pause
  exit /b %RC%
)

pause
exit /b 0