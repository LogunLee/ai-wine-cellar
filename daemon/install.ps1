# Merlotic Watchdog — регистрация в Windows Task Scheduler
# Запускать от имени администратора: Set-ExecutionPolicy Bypass -Scope Process; .\install.ps1

$TaskName    = "MerloticWatchdog"
$DaemonDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptPath  = Join-Path $DaemonDir "watchdog.js"
$NodePath    = (Get-Command node -ErrorAction Stop).Source
$LogDir      = $DaemonDir

# Убедиться, что скрипт существует
if (-not (Test-Path $ScriptPath)) {
    Write-Error "Не найден watchdog.js: $ScriptPath"
    exit 1
}

Write-Host "Node.js: $NodePath"
Write-Host "Скрипт: $ScriptPath"

# Удалить старую задачу, если есть
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Удалена старая задача $TaskName"
}

# Action: node watchdog.js
$Action = New-ScheduledTaskAction `
    -Execute $NodePath `
    -Argument "`"$ScriptPath`"" `
    -WorkingDirectory $DaemonDir

# Trigger: при входе в систему + при старте ОС (нужны права SYSTEM для boot trigger)
$TriggerLogon = New-ScheduledTaskTrigger -AtLogOn

# Настройки: всегда перезапускать при сбое, скрытый запуск
$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -Hidden

# Запускать под текущим пользователем с повышенными правами
$Principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Highest

$Task = Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $TriggerLogon `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Merlotic backend watchdog — автоматический мониторинг и перезапуск"

Write-Host ""
Write-Host "✓ Задача '$TaskName' зарегистрирована" -ForegroundColor Green
Write-Host "  Запускается: при входе в систему"
Write-Host "  Перезапуск при сбое: каждую минуту, до 999 раз"
Write-Host ""
Write-Host "Запустить прямо сейчас:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "Посмотреть лог:"
Write-Host "  Get-Content '$DaemonDir\watchdog.log' -Wait"
