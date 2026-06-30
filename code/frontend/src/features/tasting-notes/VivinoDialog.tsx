import { useEffect, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Box, Typography, Alert, CircularProgress, Divider,
} from '@mui/material'
import { ContentCopyRounded, Refresh } from '@mui/icons-material'
import { tastingNotesApi, type TastingNote } from '../../shared/api/tastingNotes'

const NOTE_MAX = 5000

interface Props {
  open: boolean
  note: TastingNote | null
  onClose: () => void
  onSaved: (updated: TastingNote) => void
}

/**
 * Подготовка заметки для Vivino: генерация LLM → редактирование → копирование/
 * сохранение. Сгенерированный текст НЕ сохраняется автоматически.
 */
export default function VivinoDialog({ open, note, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const generate = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await tastingNotesApi.generateVivino(id)
      setText(data.vivinoNoteText)
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Не удалось сгенерировать текст. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && note) {
      setText('')
      setCopied(false)
      generate(note.id)
    }
  }, [open, note?.id])

  if (!note) return null

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const saveReplace = async () => {
    setSaving(true)
    try {
      const { data } = await tastingNotesApi.update(note.id, { noteText: text })
      onSaved(data)
      onClose()
    } catch {
      setError('Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  const saveAppend = async () => {
    setSaving(true)
    try {
      const { data } = await tastingNotesApi.saveVivino(note.id, text)
      onSaved(data)
      onClose()
    } catch {
      setError('Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  const busy = loading || saving

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Заметка для Vivino</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Ваша исходная заметка</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5, color: 'text.secondary' }}>
              {note.noteText?.trim() || '(текст не заполнен)'}
            </Typography>
          </Box>

          <Divider />

          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
              <CircularProgress size={22} />
              <Typography variant="body2" color="text.secondary">Генерируем текст…</Typography>
            </Box>
          ) : error ? (
            <Box>
              <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>
              <Button startIcon={<Refresh />} onClick={() => generate(note.id)}>Повторить</Button>
            </Box>
          ) : (
            <TextField
              label="Сгенерированный текст (можно отредактировать)"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX))}
              multiline
              minRows={5}
              fullWidth
              helperText={`${text.length} / ${NOTE_MAX}`}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} disabled={busy}>Отмена</Button>
        <Box sx={{ flex: 1 }} />
        <Button startIcon={<ContentCopyRounded />} onClick={copy} disabled={busy || !text}>
          {copied ? 'Скопировано' : 'Скопировать'}
        </Button>
        <Button onClick={saveAppend} disabled={busy || !text}>Сохранить дополнительно</Button>
        <Button onClick={saveReplace} variant="contained" disabled={busy || !text}>Заменить исходную</Button>
      </DialogActions>
    </Dialog>
  )
}
