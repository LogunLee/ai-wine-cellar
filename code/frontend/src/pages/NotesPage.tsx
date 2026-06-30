import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Container, Box, TextField, FormControl, InputLabel, Select, MenuItem, Button,
  Card, CardActionArea, Typography, Rating, Chip, CircularProgress, InputAdornment,
} from '@mui/material'
import { Search as SearchIcon, Clear, AddRounded, AutoAwesomeRounded } from '@mui/icons-material'
import { tastingNotesApi, type TastingNote, type ListTastingNotesParams } from '../shared/api/tastingNotes'
import { env } from '../shared/config/env'
import NoteFormDialog from '../features/tasting-notes/NoteFormDialog'
import NoteDetailDialog from '../features/tasting-notes/NoteDetailDialog'
import VivinoDialog from '../features/tasting-notes/VivinoDialog'

const WINE_TYPES = ['RED', 'WHITE', 'ROSE', 'SPARKLING', 'SWEET', 'FORTIFIED', 'OTHER']
const WINE_TYPE_RU: Record<string, string> = {
  RED: 'Красное', WHITE: 'Белое', ROSE: 'Розовое',
  SPARKLING: 'Игристое', SWEET: 'Десертное', FORTIFIED: 'Креплёное', OTHER: 'Другое',
}
const LIMIT = 20

const photoUrl = (p: string | null) => (p ? (p.startsWith('http') ? p : `${env.API_URL}${p}`) : null)

export default function NotesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<TastingNote[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // фильтры
  const [search, setSearch] = useState('')
  const [ratingMin, setRatingMin] = useState('')
  const [wineType, setWineType] = useState('')
  const [country, setCountry] = useState('')
  const [region, setRegion] = useState('')

  // диалоги
  const [formOpen, setFormOpen] = useState(false)
  const [editNote, setEditNote] = useState<TastingNote | null>(null)
  const [detailNote, setDetailNote] = useState<TastingNote | null>(null)
  const [vivinoNote, setVivinoNote] = useState<TastingNote | null>(null)

  const buildParams = useCallback(
    (p: number): ListTastingNotesParams => ({
      page: p,
      limit: LIMIT,
      search: search.trim() || undefined,
      rating_min: ratingMin ? Number(ratingMin) : undefined,
      wine_type: wineType || undefined,
      country: country.trim() || undefined,
      region: region.trim() || undefined,
    }),
    [search, ratingMin, wineType, country, region],
  )

  const load = useCallback(async (p: number, append: boolean) => {
    setLoading(true)
    try {
      const { data } = await tastingNotesApi.list(buildParams(p))
      setItems((prev) => (append ? [...prev, ...data.items] : data.items))
      setPage(data.page)
      setTotalPages(data.totalPages)
      setTotal(data.total)
    } catch {
      if (!append) setItems([])
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  // дебаунс фильтров → перезагрузка с первой страницы
  const firstRender = useRef(true)
  useEffect(() => {
    const t = setTimeout(() => load(1, false), firstRender.current ? 0 : 500)
    firstRender.current = false
    return () => clearTimeout(t)
  }, [load])

  const hasFilters = search || ratingMin || wineType || country || region
  const clearFilters = () => { setSearch(''); setRatingMin(''); setWineType(''); setCountry(''); setRegion('') }

  // ── изменения данных из диалогов ──
  const upsert = (note: TastingNote) => setItems((prev) => {
    const idx = prev.findIndex((n) => n.id === note.id)
    if (idx === -1) return [note, ...prev]
    const next = [...prev]; next[idx] = note; return next
  })
  const handleSaved = (note: TastingNote) => { upsert(note); if (detailNote?.id === note.id) setDetailNote(note) }
  const handleChanged = (note: TastingNote) => { upsert(note); if (detailNote?.id === note.id) setDetailNote(note) }
  const handleDeleted = (id: string) => { setItems((prev) => prev.filter((n) => n.id !== id)); setTotal((t) => Math.max(0, t - 1)) }

  return (
    <Container maxWidth={false} sx={{ py: 2, px: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Поиск по названию вина…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          sx={{ minWidth: 220, bgcolor: 'white' }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Оценка от</InputLabel>
          <Select label="Оценка от" value={ratingMin} onChange={(e) => setRatingMin(e.target.value)} sx={{ bgcolor: 'white' }}>
            <MenuItem value="">Любая</MenuItem>
            {[1, 2, 3, 3.5, 4, 4.5].map((r) => <MenuItem key={r} value={r}>{r}+</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Тип</InputLabel>
          <Select label="Тип" value={wineType} onChange={(e) => setWineType(e.target.value)} sx={{ bgcolor: 'white' }}>
            <MenuItem value="">Все</MenuItem>
            {WINE_TYPES.map((t) => <MenuItem key={t} value={t}>{WINE_TYPE_RU[t]}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" label="Страна" value={country} onChange={(e) => setCountry(e.target.value)} sx={{ width: 140, bgcolor: 'white' }} />
        <TextField size="small" label="Регион" value={region} onChange={(e) => setRegion(e.target.value)} sx={{ width: 140, bgcolor: 'white' }} />
        {hasFilters && <Button size="small" startIcon={<Clear />} onClick={clearFilters}>Сбросить</Button>}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => { setEditNote(null); setFormOpen(true) }}>
          Новая заметка
        </Button>
      </Box>

      {loading && items.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Заметок пока нет</Typography>
          <Typography variant="body2">Создайте первую дегустационную заметку по вину из вашего погреба.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
          {items.map((note) => (
            <Card key={note.id} variant="outlined">
              <CardActionArea onClick={() => setDetailNote(note)} sx={{ p: 1.5, display: 'flex', alignItems: 'stretch', gap: 1.5 }}>
                <Box sx={{ width: 56, height: 76, flexShrink: 0, borderRadius: 1, bgcolor: '#f5f3f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {photoUrl(note.wine.photoPath)
                    ? <img src={photoUrl(note.wine.photoPath)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <Typography variant="caption" color="text.disabled">нет фото</Typography>}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                    {[note.wine.producer, note.wine.name].filter(Boolean).join(' ') || 'Вино'}
                    {(note.vintage ?? note.wine.vintageYear) ? ` · ${note.vintage ?? note.wine.vintageYear}` : ''}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 0.5 }}>
                    <Rating value={note.rating} precision={0.1} max={5} readOnly size="small" />
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>{note.rating.toFixed(1)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(note.tastingDate).toLocaleDateString('ru-RU')}
                    </Typography>
                  </Box>
                  {note.noteExcerpt && (
                    <Typography variant="body2" color="text.secondary" sx={{
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {note.noteExcerpt}
                    </Typography>
                  )}
                  {note.hasVivinoNote && (
                    <Chip size="small" icon={<AutoAwesomeRounded />} label="Vivino" sx={{ mt: 0.5 }} variant="outlined" color="secondary" />
                  )}
                </Box>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}

      {items.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 3 }}>
          <Typography variant="body2" color="text.secondary">Показано {items.length} из {total}</Typography>
          {page < totalPages && (
            <Button onClick={() => load(page + 1, true)} disabled={loading}>
              {loading ? 'Загрузка…' : 'Показать ещё'}
            </Button>
          )}
        </Box>
      )}

      <NoteFormDialog
        open={formOpen}
        editNote={editNote}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
      <NoteDetailDialog
        open={!!detailNote}
        note={detailNote}
        onClose={() => setDetailNote(null)}
        onEdit={(n) => { setEditNote(n); setFormOpen(true) }}
        onPrepareVivino={(n) => setVivinoNote(n)}
        onChanged={handleChanged}
        onDeleted={handleDeleted}
        onOpenWine={() => navigate('/cellar')}
      />
      <VivinoDialog
        open={!!vivinoNote}
        note={vivinoNote}
        onClose={() => setVivinoNote(null)}
        onSaved={(n) => { handleChanged(n); setVivinoNote(null) }}
      />
    </Container>
  )
}
