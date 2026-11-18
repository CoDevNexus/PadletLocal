@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
title PadletLocal - Panel de Control

set "DATA_DIR=%~dp0data"
set "CERT_DIR=%~dp0certs"
set "CA_CERT=%CERT_DIR%\PadletLocal-RootCA.crt"
set "PID_FILE=%DATA_DIR%\server.pid"
set "LOG_FILE=%DATA_DIR%\server.log"
set "ERR_FILE=%DATA_DIR%\server.err.log"
set "CFG_FILE=%DATA_DIR%\panel.cfg"

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"

:: Valores por defecto
set "PORT=3000"
set "HTTPS_PORT=3443"
set "TEACHER_PIN=1234"

call :LOAD_CONFIG

:: Verificar Node.js
where node >nul 2>&1
if errorlevel 1 (
    cls
    echo ==============================================================
    echo   ERROR: Node.js no esta instalado o no esta en el PATH.
    echo   Descargalo desde https://nodejs.org/ y vuelve a intentarlo.
    echo ==============================================================
    pause
    exit /b 1
)

:: Antes de todo: asegurar dependencias y crear certificados CA + HTTPS
if exist "%~dp0node_modules" (
    call :ENSURE_CERTS quiet
)

:: Soporte opcional por argumentos: PadletLocal.bat start | stop | status | certs
if /i "%~1"=="start" (
    call :START_SERVER noninteractive
    exit /b !errorlevel!
)
if /i "%~1"=="stop" (
    call :STOP_SERVER
    exit /b !errorlevel!
)
if /i "%~1"=="certs" (
    call :ENSURE_CERTS verbose
    exit /b !errorlevel!
)
if /i "%~1"=="status" (
    call :CHECK_STATUS
    call :GET_LAN_IP
    if "!SERVER_RUNNING!"=="1" (
        echo ACTIVO PID=!SERVER_PID! HTTPS=https://!LAN_IP!:!HTTPS_PORT! HTTP=http://!LAN_IP!:!PORT!
    ) else (
        echo DETENIDO
    )
    exit /b 0
)

:MENU
call :LOAD_CONFIG
call :CHECK_STATUS
call :CHECK_CERT_TRUST
call :GET_LAN_IP

cls
echo ==============================================================
echo                PADLETLOCAL - PANEL DE CONTROL
echo        Desarrollado por CoDevNexus - www.codevnexus.tech
echo     100%% Local LAN - Privacidad y Soberania de tus Datos
echo ==============================================================
echo.
if "%SERVER_RUNNING%"=="1" (
    echo   Estado         : [ ACTIVO ]  PID: !SERVER_PID!
    echo   HTTPS WebRTC   : https://!LAN_IP!:!HTTPS_PORT!
    echo   HTTP Rapido    : http://!LAN_IP!:!PORT!
    echo   Local          : https://localhost:!HTTPS_PORT!
) else (
    echo   Estado         : [ DETENIDO ]
    echo   IP Local       : !LAN_IP!
    echo   Puertos        : HTTP !PORT!  ^|  HTTPS !HTTPS_PORT!
)
echo   PIN Profesor   : !TEACHER_PIN!
if "%CERT_TRUSTED%"=="1" (
    echo   Certificado CA : [ CONFIADO EN ESTE EQUIPO - sin pantalla roja ]
) else (
    echo   Certificado CA : [ CREADO - usa opcion 8 para confiar en este PC ]
)
echo   Cert. alumnos  : http://!LAN_IP!:!PORT!/cert/Instalar-Certificado-Windows.bat
echo.
echo ==============================================================
echo   [1] Iniciar servidor ^(crea certificados antes de arrancar^)
echo   [2] Detener servidor
echo   [3] Reiniciar servidor
echo   [4] Abrir PadletLocal en el navegador ^(HTTPS^)
echo   [5] Cambiar PIN del Profesor / Puertos
echo   [6] Ver registro ^(log^) del servidor
echo   [7] Permitir puertos en Firewall de Windows ^(Admin^)
echo   [8] Instalar certificado CA en este PC ^(quitar pantalla roja^)
echo   [9] Buscar y aplicar actualizaciones ^(Git / Backup Seguro^)
echo   [R] Actualizar estado
echo   [0] Salir del panel
echo ==============================================================
echo.
set "OPT="
set /p "OPT=Selecciona una opcion: "

if /i "%OPT%"=="1" (
    call :START_SERVER interactive
    pause
    goto :MENU
)
if /i "%OPT%"=="2" (
    call :STOP_SERVER
    pause
    goto :MENU
)
if /i "%OPT%"=="3" (
    call :STOP_SERVER
    powershell -NoProfile -Command "Start-Sleep -Seconds 1"
    call :START_SERVER interactive
    pause
    goto :MENU
)
if /i "%OPT%"=="4" (
    call :OPEN_BROWSER
    goto :MENU
)
if /i "%OPT%"=="5" (
    call :EDIT_CONFIG
    goto :MENU
)
if /i "%OPT%"=="6" (
    call :VIEW_LOGS
    goto :MENU
)
if /i "%OPT%"=="7" (
    call :ADD_FIREWALL
    goto :MENU
)
if /i "%OPT%"=="8" (
    call :TRUST_CERT_LOCAL
    pause
    goto :MENU
)
if /i "%OPT%"=="9" (
    call :APPLY_UPDATES
    goto :MENU
)
if /i "%OPT%"=="R" goto :MENU
if /i "%OPT%"=="0" goto :EXIT_PANEL

goto :MENU

:: --------------------------------------------------------------
:: Subrutinas
:: --------------------------------------------------------------

:LOAD_CONFIG
if exist "%CFG_FILE%" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%CFG_FILE%") do (
        if /i "%%A"=="PORT" set "PORT=%%B"
        if /i "%%A"=="HTTPS_PORT" set "HTTPS_PORT=%%B"
        if /i "%%A"=="TEACHER_PIN" set "TEACHER_PIN=%%B"
    )
)
exit /b 0

:SAVE_CONFIG
(
    echo PORT=!PORT!
    echo HTTPS_PORT=!HTTPS_PORT!
    echo TEACHER_PIN=!TEACHER_PIN!
) > "%CFG_FILE%"
exit /b 0

:GET_LAN_IP
set "LAN_IP=127.0.0.1"
for /f "usebackq delims=" %%I in (`node -e "try{console.log(require('./src/network').getPrimaryLocalIP())}catch{console.log('127.0.0.1')}"`) do (
    set "LAN_IP=%%I"
)
exit /b 0

:ENSURE_CERTS
if /i "%~1"=="quiet" (
    node "%~dp0src\cert.js" >nul 2>&1
) else (
    echo [*] Verificando / generando certificados HTTPS locales...
    node "%~dp0src\cert.js"
)
exit /b !errorlevel!

:CHECK_CERT_TRUST
set "CERT_TRUSTED=0"
if exist "%CA_CERT%" (
    powershell -NoProfile -Command "$found = (Get-ChildItem Cert:\CurrentUser\Root, Cert:\LocalMachine\Root -ErrorAction SilentlyContinue | Where-Object { $_.Subject -like '*PadletLocal Root CA*' }); if ($found) { exit 0 } else { exit 1 }" >nul 2>&1
    if !errorlevel! equ 0 set "CERT_TRUSTED=1"
)
exit /b 0

:TRUST_CERT_LOCAL
call :ENSURE_CERTS verbose
if not exist "%CA_CERT%" (
    echo [ERROR] No se encontro el archivo "%CA_CERT%".
    exit /b 1
)
echo.
echo [*] Instalando "PadletLocal Root CA" en Entidades Raiz de Confianza...
echo     ^(Si Windows pide confirmacion, haz clic en SI para quitar la pantalla roja^)
certutil -user -addstore Root "%CA_CERT%"
if errorlevel 1 (
    echo [ERROR] No se completo la instalacion del certificado.
    exit /b 1
)
echo.
echo [OK] Certificado CA confiado en este equipo.
echo      Recarga o reinicia Chrome/Edge para ver el candado sin pantalla roja.
echo      Otros usuarios en la red pueden quitarla entrando a:
call :GET_LAN_IP
echo      http://!LAN_IP!:!PORT!/cert/Instalar-Certificado-Windows.bat
exit /b 0

:FIND_PORT_OWNER
set "PORT_PID="
set "PORT_PROC="
for /f "usebackq tokens=1,2 delims=|" %%A in (`powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort !PORT!,!HTTPS_PORT! -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p) { Write-Output ($p.Id.ToString() + '|' + $p.ProcessName) } }"`) do (
    set "PORT_PID=%%A"
    set "PORT_PROC=%%B"
)
exit /b 0

:CHECK_STATUS
set "SERVER_RUNNING=0"
set "SERVER_PID="
if exist "%PID_FILE%" (
    set /p SERVER_PID=<"%PID_FILE%"
    if defined SERVER_PID (
        powershell -NoProfile -Command "$p = Get-Process -Id !SERVER_PID! -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node') { exit 0 } else { exit 1 }" >nul 2>&1
        if !errorlevel! equ 0 (
            set "SERVER_RUNNING=1"
            exit /b 0
        ) else (
            del /f /q "%PID_FILE%" >nul 2>&1
            set "SERVER_PID="
        )
    )
)
:: Si no habia PID guardado, verificar si ya hay un proceso node escuchando en estos puertos
call :FIND_PORT_OWNER
if /i "!PORT_PROC!"=="node" (
    set "SERVER_RUNNING=1"
    set "SERVER_PID=!PORT_PID!"
    echo !SERVER_PID!>"%PID_FILE%"
)
exit /b 0

:START_SERVER
call :CHECK_STATUS
if "%SERVER_RUNNING%"=="1" (
    echo.
    echo [i] El servidor ya esta en ejecucion ^(PID !SERVER_PID!^).
    echo     Si quieres recargarlo con los cambios nuevos, usa la opcion [3] Reiniciar.
    exit /b 0
)

:: Verificar si otro programa distinto esta ocupando el puerto
call :FIND_PORT_OWNER
if defined PORT_PID (
    echo.
    echo [AVISO] El puerto !PORT! o !HTTPS_PORT! esta siendo usado por: !PORT_PROC! ^(PID !PORT_PID!^).
    if /i "%~1"=="interactive" (
        set "KILL_OTHER="
        set /p "KILL_OTHER=Deseas detener ese proceso para iniciar PadletLocal? (S/N) [N]: "
        if /i "!KILL_OTHER!"=="S" (
            powershell -NoProfile -Command "Stop-Process -Id !PORT_PID! -Force -ErrorAction SilentlyContinue"
            powershell -NoProfile -Command "Start-Sleep -Seconds 1"
        ) else (
            echo [i] Cambia los puertos en la opcion [5] si deseas mantener ese proceso activo.
            exit /b 1
        )
    ) else (
        echo [ERROR] Puerto ocupado por !PORT_PROC! ^(PID !PORT_PID!^).
        exit /b 1
    )
)

if not exist "%~dp0node_modules" (
    echo.
    echo [*] Instalando dependencias de Node.js por primera vez...
    call npm.cmd install
    if errorlevel 1 (
        echo [ERROR] No se pudieron instalar las dependencias.
        exit /b 1
    )
)

echo.
call :ENSURE_CERTS verbose

if /i "%~1"=="interactive" (
    call :CHECK_CERT_TRUST
    if "!CERT_TRUSTED!"=="0" (
        echo.
        set "DO_TRUST="
        set /p "DO_TRUST=El certificado CA aun no esta instalado en este PC. Instalarlo ahora para evitar pantalla roja? (S/N) [S]: "
        if /i not "!DO_TRUST!"=="N" (
            call :TRUST_CERT_LOCAL
        )
    )
)

echo.
echo [*] Iniciando PadletLocal en segundo plano...
del /f /q "%LOG_FILE%" "%ERR_FILE%" >nul 2>&1

powershell -NoProfile -Command ^
    "$env:PORT='!PORT!'; $env:HTTPS_PORT='!HTTPS_PORT!'; $env:TEACHER_PIN='!TEACHER_PIN!'; " ^
    "$p = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -RedirectStandardOutput '%LOG_FILE%' -RedirectStandardError '%ERR_FILE%' -WindowStyle Hidden -PassThru; " ^
    "Set-Content -Path '%PID_FILE%' -Value $p.Id -NoNewline"

powershell -NoProfile -Command "Start-Sleep -Seconds 2"
call :CHECK_STATUS
call :GET_LAN_IP

if "%SERVER_RUNNING%"=="1" (
    echo.
    echo [OK] PadletLocal iniciado correctamente ^(PID !SERVER_PID!^).
    echo      Red local HTTPS ^(WebRTC^): https://!LAN_IP!:!HTTPS_PORT!
    echo      Red local HTTP          : http://!LAN_IP!:!PORT!
    echo      Quitar pantalla roja    : http://!LAN_IP!:!PORT!/cert/Instalar-Certificado-Windows.bat
    echo      PIN del Profesor        : !TEACHER_PIN!
) else (
    echo.
    echo [ERROR] No se pudo iniciar el servidor. Detalle:
    if exist "%ERR_FILE%" type "%ERR_FILE%"
    if exist "%LOG_FILE%" type "%LOG_FILE%"
)
exit /b 0

:STOP_SERVER
call :CHECK_STATUS
if "%SERVER_RUNNING%"=="0" (
    echo.
    echo [i] El servidor ya esta detenido.
    exit /b 0
)

echo.
echo [*] Deteniendo PadletLocal ^(PID !SERVER_PID!^)...
powershell -NoProfile -Command "Stop-Process -Id !SERVER_PID! -Force -ErrorAction SilentlyContinue"
del /f /q "%PID_FILE%" >nul 2>&1
powershell -NoProfile -Command "Start-Sleep -Milliseconds 700"
call :CHECK_STATUS
if "%SERVER_RUNNING%"=="0" (
    echo [OK] Servidor detenido correctamente.
) else (
    echo [ERROR] No se pudo detener el proceso !SERVER_PID!.
)
exit /b 0

:OPEN_BROWSER
call :CHECK_STATUS
if "%SERVER_RUNNING%"=="0" (
    echo.
    echo [AVISO] El servidor esta detenido. Inicialo primero con la opcion [1].
    pause
    exit /b 0
)
call :GET_LAN_IP
start "" "https://!LAN_IP!:!HTTPS_PORT!"
exit /b 0

:EDIT_CONFIG
cls
echo ==============================================================
echo   CONFIGURACION DEL SERVIDOR ^(deja vacio para mantener actual^)
echo ==============================================================
echo.
set "NEW_PIN="
set "NEW_PORT="
set "NEW_HTTPS="
set /p "NEW_PIN=PIN del Profesor [!TEACHER_PIN!]: "
set /p "NEW_PORT=Puerto HTTP [!PORT!]: "
set /p "NEW_HTTPS=Puerto HTTPS [!HTTPS_PORT!]: "

if not "%NEW_PIN%"=="" set "TEACHER_PIN=%NEW_PIN%"
if not "%NEW_PORT%"=="" set "PORT=%NEW_PORT%"
if not "%NEW_HTTPS%"=="" set "HTTPS_PORT=%NEW_HTTPS%"

call :SAVE_CONFIG
echo.
echo [OK] Configuracion guardada.
call :CHECK_STATUS
if "%SERVER_RUNNING%"=="1" (
    echo [i] Reinicia el servidor ^(opcion 3^) para aplicar los cambios.
)
pause
exit /b 0

:VIEW_LOGS
cls
echo ==============================================================
echo   REGISTRO DEL SERVIDOR ^(ultimas 40 lineas^)
echo ==============================================================
echo.
if exist "%LOG_FILE%" (
    powershell -NoProfile -Command "Get-Content -Path '%LOG_FILE%' -Tail 40"
) else (
    echo ^(Sin registros todavia^)
)
if exist "%ERR_FILE%" (
    for %%A in ("%ERR_FILE%") do if %%~zA gtr 0 (
        echo.
        echo --- Errores ^(stderr^) ---
        powershell -NoProfile -Command "Get-Content -Path '%ERR_FILE%' -Tail 20"
    )
)
echo.
pause
exit /b 0

:ADD_FIREWALL
cls
echo ==============================================================
echo   CONFIGURAR FIREWALL DE WINDOWS ^(Puertos !PORT! y !HTTPS_PORT!^)
echo ==============================================================
echo.
echo Se solicitara permiso de Administrador para abrir los puertos
echo TCP !PORT! ^(HTTP^) y !HTTPS_PORT! ^(HTTPS^) en redes privadas.
echo.
pause
powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command \"New-NetFirewallRule -DisplayName ''PadletLocal HTTP'' -Direction Inbound -Protocol TCP -LocalPort !PORT! -Profile Private -Action Allow -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName ''PadletLocal HTTPS'' -Direction Inbound -Protocol TCP -LocalPort !HTTPS_PORT! -Profile Private -Action Allow -ErrorAction SilentlyContinue\"'"
echo.
echo [OK] Solicitud de reglas de firewall enviada.
pause
exit /b 0

:APPLY_UPDATES
cls
echo ==============================================================
echo   ACTUALIZACION SEGURA DEL SISTEMA - CoDevNexus
echo ==============================================================
echo.
echo Este asistente actualiza el codigo de PadletLocal asegurando que:
echo  1. Se cree un respaldo completo de tus datos (data\posts.json) y fotos (uploads\).
echo  2. Tus preguntas, respuestas, quizzes y sesiones JAMAS se pierdan o borren.
echo.
set "DO_BACKUP="
set /p "DO_BACKUP=Deseas continuar con la verificacion y respaldo? (S/N) [S]: "
if /i "%DO_BACKUP%"=="N" exit /b 0

echo.
echo [*] Creando respaldo de datos en data\backups...
node -e "try { const store = require('./src/store'); const file = store.createBackup('pre-update'); console.log('[OK] Respaldo generado en: ' + (file || 'data/backups')); } catch(e) { console.error(e.message); process.exit(1); }" 2>nul
if errorlevel 1 (
    echo [!] Generando copia manual rapida de seguridad...
    if not exist "%DATA_DIR%\backups" mkdir "%DATA_DIR%\backups"
    if exist "%DATA_DIR%\posts.json" copy /y "%DATA_DIR%\posts.json" "%DATA_DIR%\backups\posts_manual_backup.json" >nul
    echo [OK] Copia de seguridad guardada.
)

echo.
where git >nul 2>&1
if errorlevel 1 (
    echo [!] Git no esta disponible en el PATH del sistema.
    echo     Para actualizar mediante Git, instala Git desde https://git-scm.com/
    echo     O si descargaste una nueva version en archivo ZIP:
    echo     Simplemente descomprime los archivos nuevos SOBRE esta carpeta.
    echo     Tus datos en 'data\posts.json' y 'uploads\' NO se sobreescribiran.
    echo.
    pause
    exit /b 0
)

if not exist "%~dp0.git" (
    echo [i] Esta carpeta no esta vinculada aun a un repositorio Git local (.git no existe).
    echo     Puedes inicializar Git para sincronizar con tu repositorio ejecutando:
    echo       git init
    echo       git remote add origin ^<URL_DE_TU_REPOSITORIO^>
    echo       git fetch
    echo.
    pause
    exit /b 0
)

echo [*] Consultando actualizaciones en GitHub (git pull origin main)...
call git pull origin main
if errorlevel 1 (
    echo.
    echo [!] Ocurrio un aviso al actualizar desde Git. Verifica tu conexion de red o repositorio.
) else (
    echo.
    echo [OK] Codigo actualizado con exito desde el repositorio.
    echo [*] Verificando e instalando dependencias (npm install)...
    call npm.cmd install --no-audit --no-fund
    echo.
    echo [OK] Proceso de actualizacion completado sin tocar tus datos locales.
    call :CHECK_STATUS
    if "%SERVER_RUNNING%"=="1" (
        echo [i] Reinicia el servidor (opcion 3) para cargar las nuevas mejoras.
    )
)
echo.
pause
exit /b 0

:EXIT_PANEL
call :CHECK_STATUS
if "%SERVER_RUNNING%"=="1" (
    echo.
    set "STOP_ON_EXIT="
    set /p "STOP_ON_EXIT=El servidor sigue activo. Detenerlo antes de salir? (S/N) [N]: "
    if /i "!STOP_ON_EXIT!"=="S" (
        call :STOP_SERVER
        powershell -NoProfile -Command "Start-Sleep -Seconds 1"
    )
)
exit /b 0
