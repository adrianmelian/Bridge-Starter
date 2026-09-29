@echo off
setlocal
set "DATA_LAUNCH_ROOT=%~dp0"
if exist "%LOCALAPPDATA%\The Bridge\data-workspace.exe" (
  start "" "%LOCALAPPDATA%\The Bridge\data-workspace.exe" --repo "%DATA_LAUNCH_ROOT%."
  exit /b 0
)
if exist "%LOCALAPPDATA%\Data Workspace\data-workspace.exe" (
  start "" "%LOCALAPPDATA%\Data Workspace\data-workspace.exe" --repo "%DATA_LAUNCH_ROOT%."
  exit /b 0
)
if exist "%DATA_LAUNCH_ROOT%src-tauri\target\release\data-workspace.exe" (
  start "" "%DATA_LAUNCH_ROOT%src-tauri\target\release\data-workspace.exe" --repo "%DATA_LAUNCH_ROOT%."
  exit /b 0
)
rem The published 0.1.0 installer still uses the original application name.
if exist "%LOCALAPPDATA%\Mr. Mak Workspace\mrmak-workspace.exe" (
  start "" "%LOCALAPPDATA%\Mr. Mak Workspace\mrmak-workspace.exe" --repo "%DATA_LAUNCH_ROOT%."
  exit /b 0
)
echo Install The Bridge using the prepared Windows installer.
echo Or build with: powershell -NoProfile -ExecutionPolicy Bypass -File Setup.ps1 -Mode Desktop
echo See docs\getting-started.md for agent-guided setup.
pause
