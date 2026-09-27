@echo off
setlocal
cd /d "%~dp0"

rem ---- 1. Make sure Node is available (prefer bundled portable, else system) ----
set "NODE_EXE="
if exist "node\node.exe" (
  set "NODE_EXE=%CD%\node\node.exe"
) else (
  where node >nul 2>nul
  if %errorlevel%==0 (
    set "NODE_EXE=node"
  )
)

if not defined NODE_EXE (
  echo [Canvas Reader] Node.js not found.
  echo            Run install.ps1 first to download a portable Node.js into this folder.
  echo            Or install Node.js 18+ and add it to your PATH.
  pause
  exit /b 1
)

rem ---- 2. Make sure dependencies are installed ----
if not exist "node_modules" (
  echo [Canvas Reader] node_modules missing. Running install.ps1...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
  if errorlevel 1 exit /b 1
)

rem ---- 3. Run ----
"%NODE_EXE%" "src\cli.mjs" %*
set "RC=%errorlevel%"
endlocal
exit /b %RC%
