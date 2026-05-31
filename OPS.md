# Управление AI Wine Cellar

## Справочник магазинов
| Магазин | Код | ID |
|---------|-----|-----|
| Ароматный Мир | `amwine` | `bd0a300b-4e4a-4f47-81f1-532e099d4cff` |
| Винлаб | `winelab` | `630d1d87-45d6-41df-9231-5a025ab36b26` |
| SimpleWine | `simplewine` | `b6dd3f82-4502-4218-a924-aa567f482135` |
| Отдохни | `coolclever` | `2ebe8a42-be98-4db5-8247-9054f2f4b401` |
| FortWine | `fortwine` | `468abd68-b0dc-4db8-a316-1181195be41f` |
| Metro | `metro` | `776bb300-afd2-4687-a425-850ec69ec21e` |

---

## Пересобрать бэкенд и фронтенд
```powershell
# Остановить все процессы
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Пересобрать бэкенд
Set-Location "C:\Users\LoGun\Documents\ClaudeProjects\AI-wine-cellar\code"
npx nest build

# Пересобрать фронтенд
Set-Location "C:\Users\LoGun\Documents\ClaudeProjects\AI-wine-cellar\code\frontend"
npm run build
```

---

## Запустить с логами бэка (консоль)
```powershell
# Остановить все процессы
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Запустить
Set-Location "C:\Users\LoGun\Documents\ClaudeProjects\AI-wine-cellar\code"
Start-Process -FilePath "cmd.exe" -ArgumentList "/k npm run start:dev" -WorkingDirectory "C:\Users\LoGun\Documents\ClaudeProjects\AI-wine-cellar\code"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory "C:\Users\LoGun\Documents\ClaudeProjects\AI-wine-cellar\code\frontend" -WindowStyle Hidden
```

---

## Запустить бесшумно (без консоли)
```powershell
# Остановить все процессы
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Запустить
Set-Location "C:\Users\LoGun\Documents\ClaudeProjects\AI-wine-cellar\code"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run start:dev" -WindowStyle Hidden
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory "C:\Users\LoGun\Documents\ClaudeProjects\AI-wine-cellar\code\frontend" -WindowStyle Hidden
```

---

## Остановить конкретный скраппер

Endpoint для остановки отсутствует. Варианты:

**Вариант A: Пометить job как failed (скраппер продолжит работать, но статус изменится)**

```powershell
$env:PGPASSWORD="postgres"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -d ai_wine_cellar -c "UPDATE scrape_job SET status = 'failed', finished_at = NOW(), error_message = 'Manual stop' WHERE store_id = '<STORE_ID>' AND status = 'running';"
```

**Вариант B: Перезапустить бэкенд (убьёт все скрапперы)**

```powershell
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Set-Location "C:\Users\LoGun\Documents\ClaudeProjects\AI-wine-cellar\code"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run start:dev" -WindowStyle Hidden
```

---

## Запустить конкретный скраппер

**Ароматный Мир**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/admin/discount-stores/bd0a300b-4e4a-4f47-81f1-532e099d4cff/run" -Method POST
```
**Винлаб**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/admin/discount-stores/630d1d87-45d6-41df-9231-5a025ab36b26/run" -Method POST
```
**SimpleWine**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/admin/discount-stores/b6dd3f82-4502-4218-a924-aa567f482135/run" -Method POST
```
**Отдохни**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/admin/discount-stores/2ebe8a42-be98-4db5-8247-9054f2f4b401/run" -Method POST
```
**FortWine**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/admin/discount-stores/468abd68-b0dc-4db8-a316-1181195be41f/run" -Method POST
```
**Metro**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/admin/discount-stores/776bb300-afd2-4687-a425-850ec69ec21e/run" -Method POST
```

---


## **Запустить все скрапперы**

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/admin/discount-stores/run-all" -Method POST
```


---

## 4. Перезапустить бэк и фронт

```powershell
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Set-Location "C:\Users\LoGun\Documents\ClaudeProjects\AI-wine-cellar\code"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run start:dev" -WindowStyle Hidden
Set-Location "C:\Users\LoGun\Documents\ClaudeProjects\AI-wine-cellar\code\frontend"
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WindowStyle Hidden
Start-Sleep -Seconds 30
try { Invoke-WebRequest -Uri "http://localhost:3000/admin/discount-stores" -TimeoutSec 5 -UseBasicParsing; Write-Output "OK" } catch { Write-Output "Не готов: $($_.Exception.Message)" }
try { Invoke-WebRequest -Uri "http://localhost:5173/" -TimeoutSec 5 -UseBasicParsing; Write-Output "OK" } catch { Write-Output "Не готов" }
```


---

## Полезные SQL-запросы

**Статус всех скрапперов**

```powershell
$env:PGPASSWORD="postgres"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -d ai_wine_cellar -c "SELECT s.name, sj.status, sj.started_at, sj.finished_at, sj.found_count, sj.error_message FROM scrape_job sj JOIN store s ON s.id = sj.store_id ORDER BY sj.started_at DESC LIMIT 10;"
```

**Активные чекпоинты (живые скрапперы)**

```powershell
$env:PGPASSWORD="postgres"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -d ai_wine_cellar -c "SELECT s.name, sc.category, sc.page_num, sc.offers_collected, sc.heartbeat_at FROM scrape_checkpoint sc JOIN store s ON s.id = sc.store_id ORDER BY sc.heartbeat_at DESC;"
```

**Количество записей по магазинам**

```powershell
$env:PGPASSWORD="postgres"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -d ai_wine_cellar -c "SELECT s.name, COUNT(ro.id) as raw_offers, COUNT(DISTINCT do.id) as discount_offers FROM store s LEFT JOIN raw_offer ro ON ro.store_id = s.id LEFT JOIN discount_offer do ON do.store_id = s.id GROUP BY s.id, s.name ORDER BY s.name;"
```

**Сбросить зависший job**

```powershell
$env:PGPASSWORD="postgres"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -d ai_wine_cellar -c "UPDATE scrape_job SET status = 'failed', finished_at = NOW(), error_message = 'Manual reset' WHERE status = 'running';"
```

**Очистить данные магазина (перед повторным запуском)**

```powershell
$env:PGPASSWORD="postgres"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -U postgres -d ai_wine_cellar -c "DELETE FROM scrape_checkpoint WHERE store_id = '<STORE_ID>'; DELETE FROM discount_offer WHERE store_id = '<STORE_ID>'; DELETE FROM raw_offer WHERE store_id = '<STORE_ID>';"
```
