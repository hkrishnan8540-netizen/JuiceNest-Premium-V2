@echo off
cd /d "%~dp0"
if exist data\db.json del /q data\db.json
echo JuiceNest demo data reset. It will be recreated on next start.
pause
