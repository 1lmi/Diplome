@echo off
setlocal

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "FRONTEND_DIR=%ROOT_DIR%\sc-restaurant-front"
set "MOBILE_DIR=%ROOT_DIR%\sc-restaurant-mobile"
set "VENV_DIR=%ROOT_DIR%\.venv"
set "PYTHON_EXE=%VENV_DIR%\Scripts\python.exe"

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found in PATH. Install Node.js 18+ and try again.
  exit /b 1
)

if not exist "%PYTHON_EXE%" (
  echo Creating Python virtual environment...
  where py >nul 2>&1
  if not errorlevel 1 (
    py -3 -m venv "%VENV_DIR%"
  ) else (
    where python >nul 2>&1
    if errorlevel 1 (
      echo Python was not found in PATH. Install Python 3.10+ and try again.
      exit /b 1
    )
    python -m venv "%VENV_DIR%"
  )
  if errorlevel 1 (
    echo Failed to create the virtual environment.
    exit /b 1
  )
)

echo Checking backend dependencies...
"%PYTHON_EXE%" -c "import fastapi, uvicorn, multipart" >nul 2>&1
if errorlevel 1 (
  echo Installing backend dependencies...
  "%PYTHON_EXE%" -m pip install --upgrade pip
  if errorlevel 1 exit /b 1
  "%PYTHON_EXE%" -m pip install fastapi "uvicorn[standard]" python-multipart
  if errorlevel 1 exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo Installing frontend dependencies...
  pushd "%FRONTEND_DIR%" || exit /b 1
  call npm ci
  if errorlevel 1 (
    popd
    exit /b 1
  )
  popd
)

if exist "%MOBILE_DIR%\package.json" (
  if not exist "%MOBILE_DIR%\node_modules" (
    echo Installing mobile dependencies...
    pushd "%MOBILE_DIR%" || exit /b 1
    call npm ci
    if errorlevel 1 (
      popd
      exit /b 1
    )
    popd
  )
)

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.InterfaceDescription -notmatch 'Hyper-V|VMware|VirtualBox|WSL|Tailscale|WireGuard|Hamachi|ZeroTier' } | ForEach-Object { $_.IPv4Address | Where-Object { $_.IPAddress -match '^(10\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.)' } | Select-Object -First 1 -ExpandProperty IPAddress } | Select-Object -First 1)"`) do set "LAN_IP=%%I"
if not defined LAN_IP set "LAN_IP=127.0.0.1"

echo Starting backend on http://127.0.0.1:8000 ...
start "SC restaurant API" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT_DIR%'; & '%PYTHON_EXE%' -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
if errorlevel 1 (
  echo Failed to start the backend window.
  exit /b 1
)

echo Starting frontend on http://127.0.0.1:5173 ...
start "SC restaurant Frontend" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%FRONTEND_DIR%'; npm run dev -- --host --port 5173"
if errorlevel 1 (
  echo Failed to start the frontend window.
  exit /b 1
)

if exist "%MOBILE_DIR%\package.json" (
  echo Starting mobile Expo Go on http://%LAN_IP% ...
  start "SC restaurant Mobile (Expo Go)" powershell -NoExit -ExecutionPolicy Bypass -Command "$env:EXPO_PUBLIC_API_BASE_URL='http://%LAN_IP%:8000'; Set-Location -LiteralPath '%MOBILE_DIR%'; npm run start:lan"
  if errorlevel 1 (
    echo Failed to start the mobile window.
    exit /b 1
  )
)

echo Project launch started.
echo Backend:  http://127.0.0.1:8000/docs
echo Frontend: http://127.0.0.1:5173
if exist "%MOBILE_DIR%\package.json" echo Expo Go:  exp://%LAN_IP%:8081

endlocal
