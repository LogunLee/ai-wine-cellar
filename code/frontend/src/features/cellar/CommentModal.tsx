import { useState, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, IconButton,
} from '@mui/material'
import { Close } from '@mui/icons-material'
import { wineCellarApi } from '../../shared/api/wineSearch'

interface CommentModalProps {
  open: boolean
  itemId: string | null
  wineLabel: string
  onClose: () => void
  onSaved: () => void
}

const CommentModal = ({ open, itemId, wineLabel, onClose, onSaved }: CommentModalProps) => {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && itemId) {
      wineCellarApi.getNote(itemId)
        .then(({ data }) => setText(data?.text || ''))
        .catch(console.error)
    }
  }, [open, itemId])

  const handleSave = async () => {
    if (!itemId) return
    setLoading(true)
    try {
      await wineCellarApi.saveNote(itemId, text)
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{wineLabel}</Typography>
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          multiline
          minRows={6}
          maxRows={12}
          placeholder="Введите комментарий к вину..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" onClick={handleSave} disabled={loading}>
          {loading ? 'Сохраняю...' : 'Сохранить'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CommentModal
