@echo off
title CWU App
echo ========================================================
echo   Iniciando CWU App
echo ========================================================
echo.

cd /d "%~dp0backend"

echo Abrindo janela do aplicativo...
npx electron .
if %errorlevel% neq 0 (
    echo.
    echo Ocorreu um erro ao iniciar o aplicativo.
    pause
)

