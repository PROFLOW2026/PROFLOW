@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

rem ProjectFlow local dev — port 3100 only for this repo.
rem Does not touch other projects or other folders.

set "PORT=3100"
set "URL=http://localhost:%PORT%"

title ProjectFlow - Local Dev

echo.
echo ================================
echo ProjectFlow - Start Local Dev
echo ================================
echo.
echo Port:   %PORT%
echo Open:   %URL%
echo.

if not exist "node_modules\.bin\next.cmd" (
  echo [INFO] Dependencies missing - running npm install...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

rem Healthy server already up? Open browser and stop.
call :IsServerHealthy %PORT%
if "%ERRORLEVEL%"=="0" (
  echo [OK] ProjectFlow is already running on %URL%
  start "" "%URL%/he-IL/"
  pause
  exit /b 0
)

rem Port held by a dead/broken ProjectFlow instance (often no lock file) — clear it.
echo [INFO] Clearing any previous ProjectFlow dev on port %PORT% ^(this folder only^)...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local-cleanup.ps1" -Port %PORT% -RepoRoot "%~dp0"
if errorlevel 1 (
  echo [ERROR] Cannot free port %PORT%. Close the other app using it, then try again.
  pause
  exit /b 1
)

echo.
echo [INFO] Starting dev server on port %PORT%...
echo.

rem Open browser once the server responds with a healthy status.
rem First webpack compile can take 1-3 minutes; keep polling before opening the browser.
start "" powershell -NoProfile -WindowStyle Hidden -Command "$u='%URL%/he-IL'; for($i=0;$i -lt 180;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 5; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 400){ Start-Process $u; break } } catch {}; Start-Sleep 1 }"

rem IMPORTANT on Windows: do NOT use `npm run dev -- -p 3100`.
rem npm swallows `-p` / `--port` and Next.js then treats `3100` as a project directory.
rem Use the package script that already embeds `-p 3100`.
set "PORT=%PORT%"
call npm run dev:local
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo [ERROR] Dev server exited with code %EXITCODE%.
  echo [HINT] If the port is busy, close other ProjectFlow windows or run this script again.
  echo.
)

pause
exit /b %EXITCODE%

:IsServerHealthy
set "P=%~1"
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:%P%/he-IL' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
exit /b %ERRORLEVEL%
