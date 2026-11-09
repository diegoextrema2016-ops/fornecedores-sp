@echo off
title SP Fornecedores
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js em https://nodejs.org para abrir o site.
  pause
  exit /b 1
)
echo Gerando o site com os dados atuais do banco...
call node scripts\build.mjs
if errorlevel 1 (
  echo Nao foi possivel gerar o site. Verifique a conexao com a internet.
  pause
  exit /b 1
)
start "" http://localhost:8080/
node scripts\serve.mjs dist 8080
pause
