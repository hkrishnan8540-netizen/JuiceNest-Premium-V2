@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or not in PATH.
  echo Install Node.js 18+ and run this file again.
  pause
  exit /b 1
)
echo.
echo ==========================================
echo        JuiceNest Premium Campus
echo ==========================================
echo Customer: http://localhost:8080
echo Staff:    http://localhost:8080/login.html
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8080"
node server.js
pause
