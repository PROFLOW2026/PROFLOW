@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

rem ProjectFlow local dev — port 3500 only for this repo.
rem Does not touch other projects or other folders.

set "PORT=3500"
set "URL=http://localhost:%PORT%"
set "LOCKFILE=.next\dev\lock"

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

call :IsServerUp %PORT%
if errorlevel 1 (
  echo [OK] ProjectFlow is already running on %URL%
  start "" "%URL%/he-IL"
  pause
  exit /b 0
)

call :StopStaleProjectFlowDev

echo [INFO] Starting dev server on port %PORT%...
echo.

rem Open browser once the server responds (does not block dev server).
start "" cmd /c "powershell -NoProfile -Command \"$u='%URL%/he-IL'; for($i=0;$i -lt 90;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 2; if($r.StatusCode -ge 200 -and $r.StatusCode -lt 500){ Start-Process $u; break } } catch {}; Start-Sleep 1 }\""

call npm run dev:local
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo [ERROR] Dev server exited with code %EXITCODE%.
  echo.
)

pause
exit /b %EXITCODE%

:IsServerUp
set "P=%~1"
powershell -NoProfile -Command "$r = try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:%P%/' -TimeoutSec 2).StatusCode } catch { 0 }; exit ([int]($r -ge 200 -and $r -lt 500))" >nul 2>&1
exit /b %ERRORLEVEL%

:StopStaleProjectFlowDev
if not exist "%LOCKFILE%" exit /b 0

echo [INFO] Found a previous ProjectFlow dev instance for this folder.
echo [INFO] Stopping it so this site can run on port %PORT% ^(other projects are not touched^)...
echo.

powershell -NoProfile -Command ^
  "$lockPath = Join-Path (Get-Location) '.next/dev/lock';" ^
  "$targetPid = $null; $oldPort = $null;" ^
  "if (Test-Path $lockPath) {" ^
  "  try {" ^
  "    $fs = [System.IO.File]::Open($lockPath, 'Open', 'Read', 'ReadWrite');" ^
  "    $sr = New-Object System.IO.StreamReader($fs);" ^
  "    $lock = $sr.ReadToEnd() | ConvertFrom-Json;" ^
  "    $sr.Close(); $fs.Close();" ^
  "    $targetPid = [int]$lock.pid; $oldPort = $lock.port;" ^
  "  } catch {}" ^
  "};" ^
  "if (-not $targetPid) {" ^
  "  $dir = (Get-Location).Path;" ^
  "  $match = Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" -ErrorAction SilentlyContinue ^|" ^
  "    Where-Object { $_.CommandLine -and ($_.CommandLine -like \"*$dir*\") -and ($_.CommandLine -match 'next(\\.cmd)?\\s+dev') } ^|" ^
  "    Select-Object -First 1;" ^
  "  if ($match) { $targetPid = [int]$match.ProcessId }" ^
  "};" ^
  "if ($targetPid -and (Get-Process -Id $targetPid -ErrorAction SilentlyContinue)) {" ^
  "  $msg = '[INFO] Stopping old ProjectFlow dev (PID ' + $targetPid;" ^
  "  if ($oldPort) { $msg += ', was on port ' + $oldPort };" ^
  "  Write-Host ($msg + ')...');" ^
  "  & taskkill /PID $targetPid /T /F 2^>$null ^| Out-Null;" ^
  "  Start-Sleep -Seconds 2;" ^
  "} elseif (Test-Path $lockPath) {" ^
  "  Write-Host '[INFO] Old lock file found; process already gone.';" ^
  "};" ^
  "Remove-Item $lockPath -Force -ErrorAction SilentlyContinue"

exit /b 0
