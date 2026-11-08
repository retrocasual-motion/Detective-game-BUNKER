@echo off
rem БУНКЕР: запустить игру двойным щелчком. Окно сервера — закрыть, чтобы остановить.
chcp 65001 >nul
title БУНКЕР — сервер игры (закройте окно, чтобы остановить)
cd /d "%~dp0game"

rem Игра уже запущена — просто открыть страницу.
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo Игра уже запущена — открываю страницу.
  if not "%BUNKER_NO_BROWSER%"=="1" start "" http://localhost:5173
  exit /b 0
)

echo Проверяю пакеты...
call pnpm.cmd install --frozen-lockfile --reporter=silent
if errorlevel 1 (
  echo.
  echo Не удалось поставить пакеты. Подробности выше; инструкция — game\docs\DEVELOPMENT.md, раздел 3.
  pause
  exit /b 1
)

rem Браузер откроется сам, когда сервер и база будут готовы.
if not "%BUNKER_NO_BROWSER%"=="1" start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 180; $i++) { try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:8787/api/health).StatusCode -eq 200) { Start-Process 'http://localhost:5173'; break } } catch {}; Start-Sleep 1 }"

echo Запускаю игру: http://localhost:5173 — откроется в браузере сама.
echo Чтобы остановить — закройте это окно.
echo.
call pnpm.cmd dev
