@echo off
title OZEL Cafe — Mock POS
cd /d "%~dp0"
node scripts/pos-mock-server.js
pause
