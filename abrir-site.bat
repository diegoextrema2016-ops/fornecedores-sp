@echo off
title SP Fornecedores
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3") else (set "PY=python")
start "SP Fornecedores - servidor" /min cmd /c "%PY% -m http.server 8080"
timeout /t 2 /nobreak >nul
start "" http://localhost:8080/
exit
