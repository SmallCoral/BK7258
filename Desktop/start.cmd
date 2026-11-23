@echo off
cd /d "%~dp0"
uv run --locked python app.py
if errorlevel 1 pause
