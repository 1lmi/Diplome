@echo off
setlocal

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "FRONTEND_DIR=%ROOT_DIR%\meatpoint-front"
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

echo Starting backend on http://127.0.0.1:8000 ...
start "Meat Point API" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%ROOT_DIR%'; & '%PYTHON_EXE%' -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
if errorlevel 1 (
  echo Failed to start the backend window.
  exit /b 1
)

echo Starting frontend on http://127.0.0.1:5173 ...
start "Meat Point Frontend" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%FRONTEND_DIR%'; npm run dev -- --host --port 5173"
if errorlevel 1 (
  echo Failed to start the frontend window.
  exit /b 1
)

echo Project launch started.
echo Backend:  http://127.0.0.1:8000/docs
echo Frontend: http://127.0.0.1:5173

endlocal
