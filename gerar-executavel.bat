@echo off
title CWU App - Gerar Instalador
echo ========================================================
echo   Gerando o instalador do CWU App (CWU-App-Setup.exe)
echo ========================================================
echo.

cd /d "%~dp0backend"

echo [1/2] Instalando dependencias...
call npm install
if %errorlevel% neq 0 goto erro

echo [2/2] Empacotando com Electron Builder...
call npm run dist
if %errorlevel% neq 0 goto erro

echo.
echo ========================================================
echo   SUCESSO! Arquivos gerados na pasta release/
echo   Envie para a release do GitHub estes 3 arquivos:
echo     - CWU-App-Setup.exe
echo     - CWU-App-Setup.exe.blockmap
echo     - latest.yml
echo ========================================================
explorer "%~dp0release"
goto fim

:erro
echo.
echo Ocorreu um erro ao gerar o instalador.

:fim
pause
