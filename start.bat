@echo off
chcp 65001 >nul
echo.
echo ==========================================
echo   VSMS - Validation Schedule Management
echo ==========================================
echo.

:: 檢查 node 是否安裝
where node >nul 2>&1
if errorlevel 1 (
  echo [錯誤] 找不到 Node.js，請先安裝 Node.js
  pause
  exit /b 1
)

:: 設定環境變數
if exist .env (
  for /f "tokens=1,2 delims==" %%a in (.env) do (
    if not "%%a"=="" if not "%%a:~0,1%"=="#" set %%a=%%b
  )
)

set PORT=%PORT%
if "%PORT%"=="" set PORT=3001

echo [1/2] 正在建置前端...
call npm run build
if errorlevel 1 (
  echo [錯誤] 建置失敗，請檢查錯誤訊息
  pause
  exit /b 1
)

echo.
echo [2/2] 啟動 VSMS 伺服器...
echo.
echo  系統網址：http://localhost:%PORT%
echo  按 Ctrl+C 停止伺服器
echo.
node server/dist/index.js
pause