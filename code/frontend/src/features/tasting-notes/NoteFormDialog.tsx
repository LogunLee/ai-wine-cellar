import { useEffect, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Autocomplete, Box, Rating, Typography, FormControlLabel, Switch, Alert,
} from '@mui/material'
import { tastingNotesApi, type TastingNote } from '../../shared/api/tastingNotes'
import { wineCellarApi, type CellarItem } from '../../shared/api/wineSearch'

const NOTE_MAX = 5000

const wineLabel = (i: CellarItem) =>
  `${i.producer} ${i.name}${i.vintageYear ? ` ${i.vintageYear}` : ''}`.trim()

interface Props {
  open: boolean
  onClose: () => void
  onSaved: (note: TastingNote) => void
  /** Если задан — редактируем существующую заметку. */
  editNote?: TastingNote | null
  /** Предвыбранная бутылка (создание «из карточки вина»). */
  presetCellarItemId?: string | null
}

export default function NoteFormDialog({ open, onClose, onSaved, editNote, presetCellarItemId }: Props) {
  const isEdit = !!editNote
  const [items, setItems] = useState<CellarItem[]>([])
  const [cellarItemId, setCellarItemId] = useState<string>('')
  const [tastingDate, setTastingDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [rating, setRating] = useState<number | null>(null)
  const [vintage, setVintage] = useState<string>('')
  const [noteText, setNoteText] = useState<string>('')
  const [place, setPlace] = useState<string>('')
  const [price, setPrice] = useState<string>('')
  const [wouldBuyAgain, setWouldBuyAgain] = useState<boolean>(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Загрузка погреба для выбора вина (только при создании без предвыбора).
  useEffect(() => {
    if (!open || isEdit) return
    wineCellarApi.list().then(({ data }) => setItems(data)).catch(() => setItems([]))
  }, [open, isEdit])

  // Инициализация полей при открытии.
  useEffect(() => {
    if (!open) return
    setError(null)
    if (editNote) {
      setCellarItemId(editNote.wine.cellarItemId)
      setTastingDate(editNote.tastingDate.slice(0, 10))
      setRating(editNote.rating)
      setVintage(editNote.vintage != null ? String(editNote.vintage) : '')
      setNoteText(editNote.noteText ?? '')
      setPlace(editNote.place ?? '')
      setPrice(editNote.price != null ? String(editNote.price) : '')
      setWouldBuyAgain(editNote.wouldBuyAgain ?? false)
    } else {
      setCellarItemId(presetCellarItemId ?? '')
      setTastingDate(new Date().toISOString().slice(0, 10))
      setRating(null)
      setVintage('')
      setNoteText('')
      setPlace('')
      setPrice('')
      setWouldBuyAgain(false)
    }
  }, [open, editNote, presetCellarItemId])

  const selectedItem = items.find((i) => i.id === cellarItemId) ?? null

  const handleSave = async () => {
    setError(null)
    if (!isEdit && !cellarItemId) return setError('Выберите вино')
    if (!tastingDate) return setError('Укажите дату дегустации')
    if (rating == null) return setError('Поставьте оценку')

    setSaving(true)
    try {
      const payload = {
        tastingDate,
        rating,
        vintage: vintage ? Number(vintage) : null,
        noteText: noteText.trim() || null,
        place: place.trim() || null,
        price: price ? Number(price) : null,
        wouldBuyAgain,
      }
      const { data } = isEdit
        ? await tastingNotesApi.update(editNote!.id, payload)
        : await tastingNotesApi.create({ cellarItemId, ...payload })
      onSaved(data)
      onClose()
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Не удалось сохранить заметку')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{isEdit ? 'Редактировать заметку' : 'Новая дегустационная заметка'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {isEdit ? (
            <TextField label="Вино" value={wineLabel({
              producer: editNote!.wine.producer ?? '', name: editNote!.wine.name ?? '',
              vintageYear: editNote!.wine.vintageYear ?? undefined,
            } as CellarItem)} disabled fullWidth />
          ) : (
            <Autocomplete
              options={items}
              value={selectedItem}
              getOptionLabel={wineLabel}
              onChange={(_, v) => setCellarItemId(v?.id ?? '')}
              disabled={!!presetCellarItemId}
              renderInput={(params) => <TextField {...params} label="Вино *" placeholder="Выберите вино из погреба" />}
            />
          )}

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Дата дегустации *"
              type="date"
              value={tastingDate}
              onChange={(e) => setTastingDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ flex: 1, minWidth: 160 }}
            />
            <TextField
              label="Винтаж"
              type="number"
              value={vintage}
              onChange={(e) => setVintage(e.target.value)}
              sx={{ width: 120 }}
            />
          </Box>

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Личная оценка * (шаг 0,1)</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Rating value={rating} precision={0.1} max={5} onChange={(_, v) => setRating(v)} size="large" />
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 28 }}>
                {rating != null ? rating.toFixed(1) : '—'}
              </Typography>
            </Box>
          </Box>

          <TextField
            label="Текст заметки"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value.slice(0, NOTE_MAX))}
            multiline
            minRows={4}
            fullWidth
            helperText={`${noteText.length} / ${NOTE_MAX}`}
          />

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField label="Место дегустации" value={place} onChange={(e) => setPlace(e.target.value)} sx={{ flex: 1, minWidth: 160 }} />
            <TextField label="Цена" type="number" value={price} onChange={(e) => setPrice(e.target.value)} sx={{ width: 120 }} />
          </Box>

          <FormControlLabel
            control={<Switch checked={wouldBuyAgain} onChange={(e) => setWouldBuyAgain(e.target.checked)} />}
            label="Купил бы снова"
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</Button>
      </DialogActions>
    </Dialog>
  )
}
