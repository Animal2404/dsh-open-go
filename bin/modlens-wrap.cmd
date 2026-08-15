@echo off
rem dsh-opencode-quota modlens wrapper: run real modlens, log meta.usage to
rem ~/.modlens/usage.jsonl for cost tracking, then echo original output.
setlocal
set "OUT=%TEMP%\modlens-last-out.json"
set "ERR=%TEMP%\modlens-last-err.txt"
set "MODLENS_MAIN=%~dp0..\@liustack\modlens\dist\main.js"
if not exist "%MODLENS_MAIN%" set "MODLENS_MAIN=%~dp0..\..\..\@liustack\modlens\dist\main.js"
node "%MODLENS_MAIN%" %* > "%OUT%" 2> "%ERR%"
set "CODE=%ERRORLEVEL%"
node "%~dp0modlens-append.js" "%OUT%"
if exist "%OUT%" type "%OUT%"
if exist "%ERR%" type "%ERR%" 1>&2
exit /b %CODE%
