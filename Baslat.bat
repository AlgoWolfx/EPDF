@echo off
rem Uygulamayi kurulum yapmadan baslatir. PDF yolunu sürükleyip bu dosyanin üzerine birakabilirsin.
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Once Node.js kurun ve bu klasorde npm ci komutunu calistirin.
  echo Kurulum gerektirmeyen surum: https://github.com/AlgoWolfx/EPDF/releases/latest
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" . %*
