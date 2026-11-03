@echo off
title CWU App - Clean Windows Utility
echo ========================================================
echo   Iniciando CWU App Desktop (Clean Windows Utility)
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

