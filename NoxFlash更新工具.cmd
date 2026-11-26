@echo off
cd /d "%~dp0"
py -3 tools\publisher\server.py
if errorlevel 1 pause
