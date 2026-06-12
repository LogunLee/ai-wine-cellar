# Merlotic Watchdog — удаление из Task Scheduler
# Запускать от имени администратора

$TaskName = "MerloticWatchdog"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host "Задача '$TaskName' не найдена — ничего делать не надо"
    exit 0
}

# Остановить, если запущена
if ($task.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $TaskName
    Write-Host "Задача остановлена"
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "✓ Задача '$TaskName' удалена" -ForegroundColor Green
