@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo MultiView Camera Studio dependency repair
echo ========================================
echo.

call npm install --prefix client --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo Install failed. Check your internet connection and npm configuration.
  pause
  exit /b 1
)

if exist "client\node_modules\.vite" (
  echo Clearing Vite cache...
  rmdir /s /q "client\node_modules\.vite"
)

echo Preparing local Draco and KTX2 decoder assets...
call npm run prepare:decoders --prefix client
if errorlevel 1 (
  echo Decoder preparation failed.
  pause
  exit /b 1
)

echo.
echo Dependencies and decoder assets repaired successfully.
echo You can now run START_MULTIVIEW_WINDOWS.bat
pause
