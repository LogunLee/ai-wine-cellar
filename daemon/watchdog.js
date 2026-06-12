/**
 * Merlotic Watchdog — следит за бэкендом и перезапускает при падении.
 *
 * Запуск вручную: node daemon/watchdog.js
 * Автостарт:     install.ps1 регистрирует задачу в Task Scheduler
 */

'use strict'

const http      = require('http')
const https     = require('https')
const { spawn } = require('child_process')
const fs        = require('fs')
const path      = require('path')

// ─── Конфигурация ─────────────────────────────────────────────────────────────

const CONFIG = {
  backendUrl:      'http://localhost:3000/',
  checkIntervalMs: 30_000,          // пинговать каждые 30 с
  failThreshold:   3,               // сколько подряд провалов → рестарт
  startupGraceMs:  15_000,          // ждать после запуска перед первой проверкой
  codeDir:  path.resolve(__dirname, '..', 'code'),
  startCmd: 'npm',
  startArgs: ['run', 'start:prod'],
  logFile:  path.resolve(__dirname, 'watchdog.log'),
  pidFile:  path.resolve(__dirname, 'backend.pid'),
}

// ─── Логирование ──────────────────────────────────────────────────────────────

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`
  console.log(line)
  try {
    fs.appendFileSync(CONFIG.logFile, line + '\n')
  } catch (_) {}
}

const info  = (m) => log('INFO ', m)
const warn  = (m) => log('WARN ', m)
const error = (m) => log('ERROR', m)

// ─── PID-файл ─────────────────────────────────────────────────────────────────

function savePid(pid) {
  fs.writeFileSync(CONFIG.pidFile, String(pid))
}

function loadPid() {
  try { return parseInt(fs.readFileSync(CONFIG.pidFile, 'utf8'), 10) }
  catch (_) { return null }
}

function clearPid() {
  try { fs.unlinkSync(CONFIG.pidFile) } catch (_) {}
}

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true }
  catch (_) { return false }
}

// ─── Проверка здоровья ────────────────────────────────────────────────────────

function checkHealth() {
  return new Promise((resolve) => {
    const client = CONFIG.backendUrl.startsWith('https') ? https : http
    const req = client.get(CONFIG.backendUrl, { timeout: 5000 }, (res) => {
      resolve(res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

// ─── Запуск бэкенда ───────────────────────────────────────────────────────────

let backendProcess = null

function startBackend() {
  // Убить старый процесс из pid-файла, если он ещё жив
  const oldPid = loadPid()
  if (oldPid && isProcessAlive(oldPid)) {
    info(`Завершаю старый процесс PID=${oldPid}`)
    try { process.kill(oldPid, 'SIGTERM') } catch (_) {}
  }
  clearPid()

  info(`Запускаю бэкенд: ${CONFIG.startCmd} ${CONFIG.startArgs.join(' ')} в ${CONFIG.codeDir}`)

  backendProcess = spawn(CONFIG.startCmd, CONFIG.startArgs, {
    cwd:   CONFIG.codeDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,       // нужно для npm на Windows
    detached: false,
  })

  savePid(backendProcess.pid)
  info(`Бэкенд запущен PID=${backendProcess.pid}`)

  backendProcess.stdout.on('data', (d) => info(`[backend] ${d.toString().trim()}`))
  backendProcess.stderr.on('data', (d) => warn(`[backend] ${d.toString().trim()}`))

  backendProcess.on('exit', (code, signal) => {
    warn(`Бэкенд завершился (code=${code}, signal=${signal})`)
    backendProcess = null
    clearPid()
  })
}

// ─── Главный цикл ─────────────────────────────────────────────────────────────

let failures = 0
let booting  = false

async function tick() {
  if (booting) return

  const alive = await checkHealth()

  if (alive) {
    if (failures > 0) info('Бэкенд снова доступен')
    failures = 0
    return
  }

  failures++
  warn(`Бэкенд недоступен (${failures}/${CONFIG.failThreshold})`)

  if (failures >= CONFIG.failThreshold) {
    error('Порог превышен — перезапускаю бэкенд')
    failures = 0
    booting  = true
    startBackend()
    await new Promise((r) => setTimeout(r, CONFIG.startupGraceMs))
    booting = false
  }
}

// ─── Старт ────────────────────────────────────────────────────────────────────

info('Merlotic Watchdog запущен')
info(`Backend URL: ${CONFIG.backendUrl}`)
info(`Интервал проверки: ${CONFIG.checkIntervalMs / 1000}s, порог: ${CONFIG.failThreshold} провала`)

// Первичная проверка — если бэкенд не запущен, стартуем сразу
;(async () => {
  const alive = await checkHealth()
  if (!alive) {
    info('Бэкенд не отвечает при старте watchdog — запускаю')
    startBackend()
    await new Promise((r) => setTimeout(r, CONFIG.startupGraceMs))
  } else {
    info('Бэкенд уже запущен')
  }

  setInterval(tick, CONFIG.checkIntervalMs)
})()

// ─── Завершение watchdog ──────────────────────────────────────────────────────

function shutdown(sig) {
  info(`Получен сигнал ${sig} — watchdog завершается`)
  if (backendProcess) {
    info(`Останавливаю бэкенд PID=${backendProcess.pid}`)
    backendProcess.kill('SIGTERM')
  }
  process.exit(0)
}

process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
