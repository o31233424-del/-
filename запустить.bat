@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Запуск гостиничного аналитика...
echo Не закрывайте окно PowerShell, пока работаете с программой.
echo.
start "Гостиничный сервер" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8766/"
