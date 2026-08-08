@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo MultiView Camera Prompt Builder V7.3
echo V7.2 Import Stability + V7.3 Real 3D Viewport
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found in PATH.
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found in PATH.
  pause
  exit /b 1
)

echo Checking client dependencies...
call npm run repair:deps
if errorlevel 1 (
  echo.
  echo Dependency repair failed.
  echo Try manually: npm install --prefix client
  pause
  exit /b 1
)

echo.
echo Starting website at http://127.0.0.1:5173
echo.
call npm run dev
pause
