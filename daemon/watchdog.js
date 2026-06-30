/**
 * Merlotic Watchdog — следит за БЭКОМ (:3000) и ФРОНТОМ (:5173),
 * перезапускает каждый независимо при падении.
 *
 * Запуск:        node daemon/watchdog.js   (или daemon/stack.ps1 start)
 * Остановка ВСЕГО: daemon/stack.ps1 stop   (создаёт стоп-флаг → демон гасит сервисы и выходит,
 *                  и больше НЕ поднимает их, пока флаг есть)
 * Автостарт:     install.ps1 (Task Scheduler, триггер «при входе в систему»)
 *
 * Параметры через ENV (необязательно):
 *   WATCHDOG_INTERVAL_MS  — период проверки (по умолч. 60000 = 1 мин)
 *   WATCHDOG_FAILS        — сколько провалов подряд до рестарта (по умолч. 2)
 *   WATCHDOG_FRONTEND=0   — не следить за фронтом (только бэк)
 */

'use strict'

const http      = require('http')
const { spawn } = require('child_process')
const fs        = require('fs')
const path      = require('path')

// ─── Конфигурация ─────────────────────────────────────────────────────────────

const DAEMON_DIR = __dirname
const CODE_DIR   = path.resolve(__dirname, '..', 'code')

const CHECK_INTERVAL_MS = parseInt(process.env.WATCHDOG_INTERVAL_MS || '60000', 10) // 1 мин
const FAIL_THRESHOLD    = parseInt(process.env.WATCHDOG_FAILS || '2', 10)
const WATCH_FRONTEND    = process.env.WATCHDOG_FRONTEND !== '0'

const LOG_FILE  = path.join(DAEMON_DIR, 'watchdog.log')
const STOP_FLAG = path.join(DAEMON_DIR, 'watchdog.stop') // есть файл → «всё выключено намеренно»

/** Описание управляемых сервисов. */
const SERVICES = [
  {
    name: 'backend',
    url: 'http://localhost:3000/',     // 404 на / — это «жив» (statusCode < 500)
    cwd: CODE_DIR,
    cmd: 'npm',
    args: ['run', 'start:prod'],
    pidFile: path.join(DAEMON_DIR, 'backend.pid'),
    graceMs: 15_000,
    enabled: true,
  },
  {
    name: 'frontend',
    url: 'http://localhost:5173/',
    cwd: CODE_DIR,
    cmd: 'npm',
    args: ['run', 'dev:frontend'],     // cd frontend && vite (порт 5173)
    pidFile: path.join(DAEMON_DIR, 'frontend.pid'),
    graceMs: 20_000,
    enabled: WATCH_FRONTEND,
  },
].filter((s) => s.enabled)

// ─── Логирование ──────────────────────────────────────────────────────────────

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`
  console.log(line)
  try { fs.appendFileSync(LOG_FILE, line + '\n') } catch (_) {}
}
const info  = (m) => log('INFO ', m)
const warn  = (m) => log('WARN ', m)
const error = (m) => log('ERROR', m)

// ─── Стоп-флаг (выключатель) ────────────────────────────────────────────────────

function stopRequested() {
  return fs.existsSync(STOP_FLAG)
}

// ─── PID-файлы ──────────────────────────────────────────────────────────────────

function savePid(file, pid) { try { fs.writeFileSync(file, String(pid)) } catch (_) {} }
function loadPid(file)      { try { return parseInt(fs.readFileSync(file, 'utf8'), 10) } catch (_) { return null } }
function clearPid(file)     { try { fs.unlinkSync(file) } catch (_) {} }
function isAlive(pid)       { try { process.kill(pid, 0); return true } catch (_) { return false } }

// ─── Проверка здоровья ────────────────────────────────────────────────────────

function checkHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      res.resume()
      resolve(res.statusCode < 500) // любой ответ < 500 = сервис жив
    })
    req.on('error',   () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

// ─── Запуск/убийство сервиса ────────────────────────────────────────────────────

function killService(svc) {
  const pid = loadPid(svc.pidFile)
  if (pid && isAlive(pid)) {
    info(`[${svc.name}] останавливаю PID=${pid}`)
    // taskkill /T убивает и дочерние (npm → node/vite)
    try { spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: true }) } catch (_) {
      try { process.kill(pid, 'SIGTERM') } catch (_) {}
    }
  }
  clearPid(svc.pidFile)
}

function startService(svc) {
  killService(svc) // снять старый, если завис
  info(`[${svc.name}] запускаю: ${svc.cmd} ${svc.args.join(' ')} (cwd=${svc.cwd})`)
  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,        // нужно для npm на Windows
    detached: false,
  })
  svc.proc = child
  savePid(svc.pidFile, child.pid)
  info(`[${svc.name}] PID=${child.pid}`)
  child.stdout.on('data', (d) => { const t = d.toString().trim(); if (t) log('INFO ', `[${svc.name}] ${t}`) })
  child.stderr.on('data', (d) => { const t = d.toString().trim(); if (t) log('WARN ', `[${svc.name}] ${t}`) })
  child.on('exit', (code, sig) => {
    warn(`[${svc.name}] процесс завершился (code=${code}, signal=${sig})`)
    if (svc.proc === child) svc.proc = null
    clearPid(svc.pidFile)
  })
}

// ─── Главный цикл ─────────────────────────────────────────────────────────────

for (const s of SERVICES) { s.failures = 0; s.booting = false }

async function tickService(svc) {
  if (svc.booting) return
  const alive = await checkHealth(svc.url)
  if (alive) {
    if (svc.failures > 0) info(`[${svc.name}] снова доступен`)
    svc.failures = 0
    return
  }
  svc.failures++
  warn(`[${svc.name}] недоступен (${svc.failures}/${FAIL_THRESHOLD})`)
  if (svc.failures >= FAIL_THRESHOLD) {
    error(`[${svc.name}] порог превышен — перезапускаю`)
    svc.failures = 0
    svc.booting = true
    startService(svc)
    await new Promise((r) => setTimeout(r, svc.graceMs))
    svc.booting = false
  }
}

async function tick() {
  if (stopRequested()) {
    warn('Обнаружен стоп-флаг (watchdog.stop) — гашу сервисы и выхожу')
    for (const s of SERVICES) killService(s)
    process.exit(0)
  }
  for (const s of SERVICES) await tickService(s)
}

// ─── Старт ────────────────────────────────────────────────────────────────────

;(async () => {
  if (stopRequested()) {
    info('Стоп-флаг присутствует — watchdog не стартует сервисы и выходит. Снимите флаг (stack.ps1 start), чтобы поднять.')
    process.exit(0)
  }

  info('Merlotic Watchdog запущен')
  info(`Сервисы: ${SERVICES.map((s) => s.name).join(', ')} | интервал ${CHECK_INTERVAL_MS / 1000}s | порог ${FAIL_THRESHOLD}`)

  // Первичная проверка — поднять то, что лежит
  for (const svc of SERVICES) {
    const alive = await checkHealth(svc.url)
    if (!alive) {
      info(`[${svc.name}] не отвечает при старте — запускаю`)
      startService(svc)
      await new Promise((r) => setTimeout(r, svc.graceMs))
    } else {
      info(`[${svc.name}] уже запущен`)
    }
  }

  setInterval(() => { tick().catch((e) => error(`tick: ${e.message}`)) }, CHECK_INTERVAL_MS)
})()

// ─── Завершение самого watchdog ─────────────────────────────────────────────────
// ВНИМАНИЕ: по сигналу watchdog НЕ убивает сервисы (чтобы перезапуск самого демона
// через Task Scheduler не ронял рабочие бэк/фронт). Полное гашение — только через
// стоп-флаг (stack.ps1 stop).

function shutdown(sig) {
  info(`Watchdog получил ${sig} — выхожу (сервисы оставляю как есть)`)
  process.exit(0)
}
process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
