import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Rating, Chip, Divider, IconButton, Tooltip, TextField,
  Dialog as ConfirmDialog, DialogContentText,
} from '@mui/material'
import {
  EditRounded, DeleteRounded, AutoAwesomeRounded, ContentCopyRounded,
  OpenInNewRounded, Check, Close,
} from '@mui/icons-material'
import { tastingNotesApi, type TastingNote } from '../../shared/api/tastingNotes'

const WINE_TYPE_RU: Record<string, string> = {
  RED: 'Красное', WHITE: 'Белое', ROSE: 'Розовое',
  SPARKLING: 'Игристое', SWEET: 'Десертное', FORTIFIED: 'Креплёное', OTHER: 'Другое',
}

interface Props {
  open: boolean
  note: TastingNote | null
  onClose: () => void
  onEdit: (note: TastingNote) => void
  onPrepareVivino: (note: TastingNote) => void
  onChanged: (note: TastingNote) => void
  onDeleted: (id: string) => void
  onOpenWine: (cellarItemId: string) => void
}

export default function NoteDetailDialog({
  open, note, onClose, onEdit, onPrepareVivino, onChanged, onDeleted, onOpenWine,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingVivino, setEditingVivino] = useState(false)
  const [vivinoDraft, setVivinoDraft] = useState('')
  const [busy, setBusy] = useState(false)

  if (!note) return null

  const wineTitle = [note.wine.producer, note.wine.name].filter(Boolean).join(' ') || 'Вино'
  const subtitleParts = [
    note.wine.wineType ? WINE_TYPE_RU[note.wine.wineType] ?? note.wine.wineType : null,
    note.wine.region || note.wine.country,
    note.vintage ?? note.wine.vintageYear,
  ].filter(Boolean)

  const handleDelete = async () => {
    setBusy(true)
    try {
      await tastingNotesApi.remove(note.id)
      onDeleted(note.id)
      setConfirmDelete(false)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const startEditVivino = () => {
    setVivinoDraft(note.vivinoNoteText ?? '')
    setEditingVivino(true)
  }

  const saveVivino = async () => {
    setBusy(true)
    try {
      const { data } = await tastingNotesApi.saveVivino(note.id, vivinoDraft)
      onChanged(data)
      setEditingVivino(false)
    } finally {
      setBusy(false)
    }
  }

  const deleteVivino = async () => {
    setBusy(true)
    try {
      const { data } = await tastingNotesApi.deleteVivino(note.id)
      onChanged(data)
    } finally {
      setBusy(false)
    }
  }

  const copy = (text: string) => navigator.clipboard.writeText(text).catch(() => {})

  return (
    <>
      <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, pr: 6 }}>
          {wineTitle}
          <Typography variant="body2" color="text.secondary">{subtitleParts.join(' · ')}</Typography>
          <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Rating value={note.rating} precision={0.1} max={5} readOnly />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{note.rating.toFixed(1)} / 5</Typography>
              <Box sx={{ flex: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {new Date(note.tastingDate).toLocaleDateString('ru-RU')}
              </Typography>
            </Box>

            {note.wine.grapes?.length ? (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {note.wine.grapes.map((g) => <Chip key={g} label={g} size="small" variant="outlined" />)}
              </Box>
            ) : null}

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {note.place && <Chip size="small" label={`Место: ${note.place}`} />}
              {note.price != null && <Chip size="small" label={`Цена: ${note.price} ₽`} />}
              {note.wouldBuyAgain != null && (
                <Chip size="small" color={note.wouldBuyAgain ? 'success' : 'default'}
                  label={note.wouldBuyAgain ? 'Купил бы снова' : 'Не купил бы снова'} />
              )}
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Личная заметка</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {note.noteText?.trim() || <span style={{ color: '#9e9e9e' }}>Без текста</span>}
              </Typography>
            </Box>

            {note.hasVivinoNote && (
              <>
                <Divider />
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>Заметка для Vivino</Typography>
                    {!editingVivino && (
                      <>
                        <Tooltip title="Редактировать"><IconButton size="small" onClick={startEditVivino}><EditRounded fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Скопировать"><IconButton size="small" onClick={() => copy(note.vivinoNoteText ?? '')}><ContentCopyRounded fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Удалить Vivino-версию"><IconButton size="small" color="error" onClick={deleteVivino} disabled={busy}><DeleteRounded fontSize="small" /></IconButton></Tooltip>
                      </>
                    )}
                  </Box>
                  {editingVivino ? (
                    <Box>
                      <TextField value={vivinoDraft} onChange={(e) => setVivinoDraft(e.target.value.slice(0, 5000))} multiline minRows={4} fullWidth />
                      <Box sx={{ display: 'flex', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
                        <Button size="small" startIcon={<Close />} onClick={() => setEditingVivino(false)}>Отмена</Button>
                        <Button size="small" variant="contained" startIcon={<Check />} onClick={saveVivino} disabled={busy || !vivinoDraft.trim()}>Сохранить</Button>
                      </Box>
                    </Box>
                  ) : (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{note.vivinoNoteText}</Typography>
                  )}
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button startIcon={<OpenInNewRounded />} onClick={() => onOpenWine(note.wine.cellarItemId)}>Карточка вина</Button>
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<AutoAwesomeRounded />} onClick={() => onPrepareVivino(note)}>Подготовить для Vivino</Button>
          <Button startIcon={<EditRounded />} onClick={() => onEdit(note)}>Изменить</Button>
          <Button startIcon={<DeleteRounded />} color="error" onClick={() => setConfirmDelete(true)}>Удалить</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Удалить заметку?</DialogTitle>
        <DialogContent>
          <DialogContentText>Заметка по «{wineTitle}» будет удалена. Действие нельзя отменить.</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDelete(false)}>Отмена</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={busy}>Удалить</Button>
        </DialogActions>
      </ConfirmDialog>
    </>
  )
}
