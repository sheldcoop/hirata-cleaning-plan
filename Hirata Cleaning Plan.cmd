@echo off
rem Hirata Cleaning Plan - launcher. Keep this file next to index.html.
rem Works from a mapped drive (Z:\...) and a network path (\\server\share\...).
setlocal EnableExtensions EnableDelayedExpansion
set "HERE=%~dp0"
set "PCT=%%"
set "P=!HERE:\=/!"
set "P=!P: =%PCT%20!"
set "P=!P:#=%PCT%23!"
if "!P:~0,2!"=="//" (set "URL=file:!P!index.html") else (set "URL=file:///!P!index.html")
start "" msedge "!URL!"
if errorlevel 1 (
  echo Microsoft Edge could not be started. Open this address in Edge by hand:
  echo !URL!
  pause
)
endlocal
