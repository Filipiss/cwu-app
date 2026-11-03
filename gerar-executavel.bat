@echo off
title CWU App - Gerar Executavel Portatil (.exe)
echo ========================================================
echo   Compilando CWU App em arquivo executavel (.exe)
echo ========================================================
echo.

cd /d "%~dp0backend"

echo [1/2] Empacotando com Electron Builder...
npm run dist:portable

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   SUCESSO! O executavel foi gerado na pasta: release/
    echo ========================================================
    explorer "%~dp0release"
) else (
    echo.
    echo Ocorreu um erro ao gerar o executavel.
)
pause
