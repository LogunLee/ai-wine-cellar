import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  ErrorOutlined,
  ExpandLess,
  ExpandMore,
  HelpOutlined,
  RestartAlt,
} from '@mui/icons-material'
import {
  aiSettingsApi,
  type AiCatalogProvider,
  type AiSettingsResponse,
  type AiTaskInfo,
} from '../../shared/api/aiSettings'

// ─── Мини-рендер markdown инструкций (заголовки, жирный, ссылки, списки) ─────

const renderInline = (text: string, keyPrefix: string) => {
  const parts: React.ReactNode[] = []
  // [текст](url) и **жирный**
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1] && m[2]) {
      parts.push(
        <Link key={`${keyPrefix}-${i++}`} href={m[2]} target="_blank" rel="noopener noreferrer">
          {m[1]}
        </Link>,
      )
    } else if (m[3]) {
      parts.push(<strong key={`${keyPrefix}-${i++}`}>{m[3]}</strong>)
    } else if (m[4]) {
      parts.push(
        <Box key={`${keyPrefix}-${i++}`} component="code" sx={{ bgcolor: 'grey.100', px: 0.5, borderRadius: 0.5, fontSize: '0.85em' }}>
          {m[4]}
        </Box>,
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const InstructionsMarkdown = ({ text }: { text: string }) => (
  <Box sx={{ '& > *': { mb: 1 } }}>
    {text.split('\n').map((line, idx) => {
      const trimmed = line.trim()
      if (!trimmed) return null
      if (trimmed.startsWith('### ')) {
        return (
          <Typography key={idx} variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>
            {renderInline(trimmed.slice(4), `h-${idx}`)}
          </Typography>
        )
      }
      const listMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
      if (listMatch) {
        return (
          <Typography key={idx} variant="body2" sx={{ pl: 2 }}>
            {listMatch[1]}. {renderInline(listMatch[2], `l-${idx}`)}
          </Typography>
        )
      }
      return (
        <Typography key={idx} variant="body2" color="text.secondary">
          {renderInline(trimmed, `p-${idx}`)}
        </Typography>
      )
    })}
  </Box>
)

// ─── Карточка провайдера ─────────────────────────────────────────────────────

const ProviderCard = ({
  provider,
  keyInfo,
  onChanged,
  notify,
}: {
  provider: AiCatalogProvider
  keyInfo: AiSettingsResponse['providerKeys'][number] | undefined
  onChanged: () => void
  notify: (msg: string, ok?: boolean) => void
}) => {
  const [showInstructions, setShowInstructions] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const hasKey = !!keyInfo
  const showInput = !hasKey || editing

  const save = async () => {
    if (!keyInput.trim()) return
    setBusy(true)
    try {
      await aiSettingsApi.saveKey(provider.code, keyInput.trim())
      setKeyInput('')
      setEditing(false)
      // сразу проверяем подключение
      const { data } = await aiSettingsApi.testKey(provider.code)
      notify(data.ok ? `Ключ ${provider.name} работает` : data.error || 'Ключ сохранён, но проверка не прошла', data.ok)
      onChanged()
    } catch (e: any) {
      notify(e.response?.data?.message || 'Не удалось сохранить ключ', false)
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      const { data } = await aiSettingsApi.testKey(provider.code)
      notify(data.ok ? `Ключ ${provider.name} работает` : data.error || 'Проверка не прошла', data.ok)
      onChanged()
    } catch {
      notify('Не удалось проверить ключ', false)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await aiSettingsApi.deleteKey(provider.code)
      notify(`Ключ ${provider.name} удалён`)
      onChanged()
    } catch {
      notify('Не удалось удалить ключ', false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {provider.name}
        </Typography>
        {hasKey && (
          <Chip
            size="small"
            icon={keyInfo!.isValid === false ? <ErrorOutlined /> : <CheckCircleOutlined />}
            color={keyInfo!.isValid === false ? 'error' : keyInfo!.isValid ? 'success' : 'default'}
            label={
              keyInfo!.isValid === false
                ? `${keyInfo!.keyMask} — не работает`
                : keyInfo!.keyMask
            }
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          startIcon={showInstructions ? <ExpandLess /> : <HelpOutlined />}
          onClick={() => setShowInstructions(!showInstructions)}
        >
          Как получить ключ
        </Button>
      </Box>

      {provider.freeTierNote && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {provider.freeTierNote}
        </Typography>
      )}

      <Collapse in={showInstructions}>
        <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
          <InstructionsMarkdown text={provider.keyInstructions} />
        </Box>
      </Collapse>

      <Box sx={{ display: 'flex', gap: 1, mt: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        {showInput ? (
          <>
            <TextField
              size="small"
              type="password"
              placeholder="Вставьте API-ключ"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
              autoComplete="off"
            />
            <Button variant="contained" size="small" onClick={save} disabled={busy || !keyInput.trim()}>
              Сохранить и проверить
            </Button>
            {editing && (
              <Button size="small" onClick={() => { setEditing(false); setKeyInput('') }}>
                Отмена
              </Button>
            )}
          </>
        ) : (
          <>
            <Button size="small" variant="outlined" onClick={test} disabled={busy}>
              Проверить подключение
            </Button>
            <Button size="small" onClick={() => setEditing(true)} disabled={busy}>
              Заменить ключ
            </Button>
            <Tooltip title="Удалить ключ (настройки задач на этом провайдере сбросятся)">
              <IconButton size="small" color="error" onClick={remove} disabled={busy}>
                <DeleteOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
        {busy && <CircularProgress size={18} />}
      </Box>
    </Paper>
  )
}

// ─── Карточка задачи ─────────────────────────────────────────────────────────

const TaskCard = ({
  task,
  catalog,
  connectedProviders,
  onChanged,
  notify,
}: {
  task: AiTaskInfo
  catalog: AiCatalogProvider[]
  connectedProviders: Set<string>
  onChanged: () => void
  notify: (msg: string, ok?: boolean) => void
}) => {
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState(task.setting?.customPrompt ?? '')
  const [promptOpen, setPromptOpen] = useState(false)

  // Модели, подходящие задаче, из подключённых провайдеров
  const options = useMemo(
    () =>
      catalog
        .filter((p) => connectedProviders.has(p.code))
        .flatMap((p) =>
          p.models
            .filter((m) => m.capabilities.includes(task.requiredCapability))
            .map((m) => ({ ...m, providerName: p.name, providerCode: p.code })),
        ),
    [catalog, connectedProviders, task.requiredCapability],
  )

  const trialLeft = Math.max(0, task.trialLimit - task.trialUsed)
  const usingOwn = !!task.setting

  const selectModel = async (modelId: string) => {
    setBusy(true)
    try {
      await aiSettingsApi.saveTaskSetting(task.code, {
        modelId,
        customPrompt: task.promptEditable ? prompt || null : undefined,
      })
      notify(`Модель для «${task.name}» сохранена`)
      onChanged()
    } catch (e: any) {
      notify(e.response?.data?.message || 'Не удалось сохранить', false)
    } finally {
      setBusy(false)
    }
  }

  // Промпт-задача без модели (например, «Внешнее исследование»)
  if (!task.requiresModel) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {task.name}
        </Typography>
        {task.description && (
          <Typography variant="caption" color="text.secondary">
            {task.description}
          </Typography>
        )}
        {task.promptEditable && (
          <Box sx={{ mt: 1.5 }}>
            <TextField
              multiline
              minRows={3}
              fullWidth
              size="small"
              placeholder={task.defaultPrompt ?? ''}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              helperText="Пустое поле = стандартный промпт"
            />
            <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
              <Button
                size="small"
                variant="contained"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await aiSettingsApi.saveTaskSetting(task.code, { customPrompt: prompt.trim() || null })
                    notify('Промпт сохранён')
                    onChanged()
                  } catch (e: any) {
                    notify(e.response?.data?.message || 'Не удалось сохранить', false)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Сохранить промпт
              </Button>
              <Button size="small" disabled={busy || !prompt} onClick={() => setPrompt('')}>
                Вернуть стандартный
              </Button>
              {busy && <CircularProgress size={18} />}
            </Box>
          </Box>
        )}
      </Paper>
    )
  }

  const reset = async () => {
    setBusy(true)
    try {
      await aiSettingsApi.resetTaskSetting(task.code)
      setPrompt('')
      notify(`«${task.name}» сброшена на пробный режим`)
      onChanged()
    } catch {
      notify('Не удалось сбросить', false)
    } finally {
      setBusy(false)
    }
  }

  const savePrompt = async () => {
    if (!task.setting) return
    setBusy(true)
    try {
      await aiSettingsApi.saveTaskSetting(task.code, {
        modelId: task.setting.modelId,
        customPrompt: prompt.trim() || null,
      })
      notify('Промпт сохранён')
      onChanged()
    } catch (e: any) {
      notify(e.response?.data?.message || 'Не удалось сохранить промпт', false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {task.name}
          </Typography>
          {task.description && (
            <Typography variant="caption" color="text.secondary">
              {task.description}
            </Typography>
          )}
        </Box>
        {usingOwn ? (
          <Chip size="small" color="success" label={`Своя модель: ${task.setting!.modelName}`} />
        ) : (
          <Chip
            size="small"
            color={trialLeft > 0 ? 'warning' : 'error'}
            label={trialLeft > 0 ? `Пробный режим: осталось ${trialLeft} из ${task.trialLimit}` : 'Пробные вызовы закончились'}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mt: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel>Модель</InputLabel>
          <Select
            label="Модель"
            value={task.setting?.modelId ?? ''}
            onChange={(e) => selectModel(e.target.value)}
            disabled={busy || options.length === 0}
          >
            {options.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {o.providerName} · {o.name}
                {o.note ? ` — ${o.note}` : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {usingOwn && (
          <Tooltip title="Вернуться в пробный режим">
            <span>
              <Button size="small" startIcon={<RestartAlt />} onClick={reset} disabled={busy}>
                Сбросить
              </Button>
            </span>
          </Tooltip>
        )}
        {busy && <CircularProgress size={18} />}
      </Box>

      {options.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Сначала подключите провайдера с поддержкой «{task.requiredCapability === 'vision' ? 'изображений' : 'текста'}» в блоке выше.
        </Typography>
      )}

      {task.promptEditable && usingOwn && (
        <Box sx={{ mt: 1.5 }}>
          <Button
            size="small"
            startIcon={promptOpen ? <ExpandLess /> : <ExpandMore />}
            onClick={() => setPromptOpen(!promptOpen)}
          >
            Промпт {task.setting?.customPrompt ? '(изменён)' : '(стандартный)'}
          </Button>
          <Collapse in={promptOpen}>
            <TextField
              multiline
              minRows={4}
              fullWidth
              size="small"
              sx={{ mt: 1 }}
              placeholder={task.defaultPrompt ?? ''}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              helperText="Пустое поле = стандартный промпт"
            />
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button size="small" variant="contained" onClick={savePrompt} disabled={busy}>
                Сохранить промпт
              </Button>
              <Button
                size="small"
                onClick={() => setPrompt('')}
                disabled={busy || !prompt}
              >
                Вернуть стандартный
              </Button>
            </Box>
          </Collapse>
        </Box>
      )}
    </Paper>
  )
}

// ─── Вкладка целиком ─────────────────────────────────────────────────────────

const AiSettingsTab = () => {
  const [catalog, setCatalog] = useState<AiCatalogProvider[]>([])
  const [settings, setSettings] = useState<AiSettingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [snack, setSnack] = useState<{ msg: string; ok: boolean } | null>(null)

  const notify = useCallback((msg: string, ok = true) => setSnack({ msg, ok }), [])

  const reload = useCallback(async () => {
    try {
      const [cat, set] = await Promise.all([aiSettingsApi.catalog(), aiSettingsApi.settings()])
      setCatalog(cat.data.providers)
      setSettings(set.data)
    } catch {
      notify('Не удалось загрузить настройки AI', false)
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    reload()
  }, [reload])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  const connectedProviders = new Set(settings?.providerKeys.map((k) => k.providerCode) ?? [])
  const keyByProvider = new Map(settings?.providerKeys.map((k) => [k.providerCode, k]) ?? [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Провайдеры AI
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Подключите своего провайдера — и AI-функции будут работать на вашем бесплатном или платном лимите.
          Ключи хранятся в зашифрованном виде и никогда не показываются повторно.
        </Typography>
      </Box>
      {catalog.map((p) => (
        <ProviderCard
          key={p.code}
          provider={p}
          keyInfo={keyByProvider.get(p.code)}
          onChanged={reload}
          notify={notify}
        />
      ))}

      <Divider sx={{ my: 1 }} />

      <Box>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          AI-задачи
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Для каждой задачи выберите модель. Пока модель не выбрана, действует пробный режим на наших ключах.
        </Typography>
      </Box>
      {settings?.tasks.map((t) => (
        <TaskCard
          key={t.code}
          task={t}
          catalog={catalog}
          connectedProviders={connectedProviders}
          onChanged={reload}
          notify={notify}
        />
      ))}

      <Snackbar open={!!snack} autoHideDuration={5000} onClose={() => setSnack(null)}>
        <Alert severity={snack?.ok ? 'success' : 'error'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default AiSettingsTab
