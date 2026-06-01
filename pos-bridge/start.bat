@echo off
title OZEL POS Bridge Server
cd /d "%~dp0"
echo [Bridge] Installing dependencies...
call npm install
echo [Bridge] Starting server...
node bridge.js
pause
