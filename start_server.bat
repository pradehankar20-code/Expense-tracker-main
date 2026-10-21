@echo off
start http://localhost:8000
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
