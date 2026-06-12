import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Box, Container, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, Paper, TextField,
  IconButton, Chip, Tooltip, Menu, MenuItem, Button,
  FormControl, InputLabel, Select,
  Checkbox, Typography, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  CircularProgress,
} from '@mui/material'
import {
  EditRounded, DeleteRounded, SettingsRounded,
  Search as SearchIcon, Clear,
  ContentCopyRounded, ChatRounded, ChatOutlined, Check, Cancel,
  PhotoCamera, CloudDownload, FileDownloadRounded,
} from '@mui/icons-material'
import * as XLSX from 'xlsx'
import { wineCellarApi, type CellarItem } from '../shared/api/wineSearch'
import { env } from '../shared/config/env'
import { getCachedCountries } from '../shared/services/countryCache'
import CommentModal from '../features/cellar/CommentModal'

const WINE_TYPE_STYLES: Record<string, { bg: string; color: string; border: string; pattern?: string }> = {
  RED: { bg: '#fde8e8', color: '#8b0000', border: '#c62828' },
  WHITE: { bg: '#fff9c4', color: '#827717', border: '#c0ca33' },
  ROSE: { bg: '#fce4ec', color: '#ad1457', border: '#e91e63' },
  SPARKLING: { bg: '#fff9c4', color: '#827717', border: '#c0ca33', pattern: 'radial-gradient(circle, #c0ca33 1.5px, transparent 1.5px)' },
  SWEET: { bg: '#fff3e0', color: '#e65100', border: '#ff9800' },
  FORTIFIED: { bg: '#efebe9', color: '#4e342e', border: '#795548' },
  OTHER: { bg: '#f5f5f5', color: '#616161', border: '#9e9e9e' },
}

const WineTypeChip = ({ type }: { type: string }) => {
  const s = WINE_TYPE_STYLES[type] || WINE_TYPE_STYLES.OTHER
  return (
    <Chip
      label={type}
      size="small"
      sx={{
        bgcolor: s.bg,
        color: s.color,
        borderColor: s.border,
        fontWeight: 600,
        fontSize: '0.75rem',
        ...(s.pattern && {
          backgroundImage: s.pattern,
          backgroundSize: '8px 8px',
        }),
      }}
    />
  )
}

const COLS = [
  { key: 'photo', label: 'Фото' },
  { key: 'producer', label: 'Производитель' },
  { key: 'name', label: 'Название' },
  { key: 'vintageYear', label: 'Год' },
  { key: 'country', label: 'Страна' },
  { key: 'region', label: 'Регион' },
  { key: 'wineType', label: 'Тип' },
  { key: 'grapes', label: 'Сорта' },
  { key: 'quantity', label: 'Кол-во' },
] as const

const SETTINGS_KEY = 'enolo_cellar_settings'

interface CellarSettings {
  visibleCols: string[]
  colOrder: string[]
}

const defaultSettings: CellarSettings = {
  visibleCols: COLS.map((c) => c.key),
  colOrder: COLS.map((c) => c.key),
}

function loadSettings(): CellarSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const s = JSON.parse(raw)
      if (Array.isArray(s.visibleCols) && Array.isArray(s.colOrder)) return s
    }
  } catch { /* ignore */ }
  return defaultSettings
}

function saveSettings(s: CellarSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

const CellarPage = () => {
  const [items, setItems] = useState<CellarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterCountry, setFilterCountry] = useState<string>('')
  const [filterRegion, setFilterRegion] = useState<string>('')
  const [filterGrape, setFilterGrape] = useState<string>('')
  const [sortState, setSortState] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'createdAt', dir: 'desc' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<CellarItem> & { countryIso2?: string }>({})
  const [settings, setSettings] = useState<CellarSettings>(loadSettings)
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null)
  const [countries] = useState(() => getCachedCountries())
  const [commentItemId, setCommentItemId] = useState<string | null>(null)
  const [commentWineLabel, setCommentWineLabel] = useState('')
  const [hasNoteMap, setHasNoteMap] = useState<Record<string, boolean>>({})
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleteTargetLabel, setDeleteTargetLabel] = useState('')
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null)
  const [fetchingPhotoId, setFetchingPhotoId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(50)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    wineCellarApi.list().then(({ data }) => setItems(data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    window.addEventListener('cellar-updated', () => {
      wineCellarApi.list().then(({ data }) => { setItems(data); setVisibleCount(50) }).catch(console.error)
    })
  }, [])

  useEffect(() => {
    setVisibleCount(50)
  }, [search, filterType, filterCountry, filterRegion, filterGrape, sortState])

  useEffect(() => {
    const noteMap: Record<string, boolean> = {}
    items.forEach((item) => {
      wineCellarApi.getNote(item.id)
        .then(({ data }) => {
          if (data) noteMap[item.id] = true
        })
        .catch(() => {})
    })
    setTimeout(() => setHasNoteMap({ ...noteMap }), 500)
  }, [items])

  const visibleCountRef = useRef(visibleCount)
  visibleCountRef.current = visibleCount

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset
      const windowHeight = window.innerHeight
      const docHeight = document.documentElement.scrollHeight
      if (scrollY + windowHeight >= docHeight - 400) {
        setVisibleCount((prev) => prev + 50)
      }
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const copyWineInfo = (item: CellarItem) => {
    const text = `${item.producer} ${item.name}${item.vintageYear ? ` ${item.vintageYear}` : ''}`
    navigator.clipboard.writeText(text).catch(console.error)
  }

  const openComment = (item: CellarItem) => {
    setCommentItemId(item.id)
    setCommentWineLabel(`${item.producer} ${item.name}${item.vintageYear ? ` ${item.vintageYear}` : ''}`)
  }

  const handleUploadPhoto = (item: CellarItem) => {
    if (!photoInputRef.current) return
    photoInputRef.current.dataset.itemId = item.id
    photoInputRef.current.click()
  }

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const itemId = (e.target as HTMLInputElement).dataset.itemId
    if (!file || !itemId) return

    setUploadingPhotoId(itemId)
    try {
      await wineCellarApi.uploadPhoto(itemId, file)
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, photoPath: `/uploads/cellar/${file.name}` } : i)))
    } catch (err) {
      console.error(err)
    } finally {
      setUploadingPhotoId(null)
      e.target.value = ''
    }
  }

  const handleFetchPhoto = async (item: CellarItem) => {
    setFetchingPhotoId(item.id)
    try {
      const { data } = await wineCellarApi.fetchPhoto(item.id, {
        producer: item.producer,
        name: item.name,
        vintageYear: item.vintageYear,
      })
      if (data.photoPath) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, photoPath: data.photoPath } : i)))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setFetchingPhotoId(null)
    }
  }

  const allGrapes = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => i.grapes?.forEach((g) => set.add(g)))
    return [...set].sort()
  }, [items])

  const allRegions = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => i.region && set.add(i.region))
    return [...set].sort()
  }, [items])

  const filtered = useMemo(() => {
    let result = items
    if (search) {
      const s = search.toLowerCase()
      result = result.filter((i) =>
        `${i.producer} ${i.name} ${i.vintageYear || ''}`.toLowerCase().includes(s),
      )
    }
    if (filterType) result = result.filter((i) => i.wineType === filterType)
    if (filterCountry) result = result.filter((i) => i.country === filterCountry)
    if (filterRegion) result = result.filter((i) => i.region === filterRegion)
    if (filterGrape) result = result.filter((i) => i.grapes?.includes(filterGrape))
    return result
  }, [items, search, filterType, filterCountry, filterRegion, filterGrape])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortState.col]
      const bv = (b as any)[sortState.col]
      if (av == null && bv == null) return 0
      if (av == null) return sortState.dir === 'asc' ? -1 : 1
      if (bv == null) return sortState.dir === 'asc' ? 1 : -1
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'ru')
      return sortState.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortState])

  const visibleItems = sorted.slice(0, visibleCount)

  const handleSort = useCallback((col: string) => {
    setSortState((prev) => ({
      col,
      dir: prev.col === col ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc',
    }))
  }, [])

  const startEdit = (item: CellarItem) => {
    setEditingId(item.id)
    setDraft({
      producer: item.producer,
      name: item.name,
      vintageYear: item.vintageYear,
      region: item.region,
      countryIso2: countries.find((c) => c.name === item.country)?.iso2,
      wineType: item.wineType,
      quantity: item.quantity,
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      const updated = await wineCellarApi.update(editingId, {
        producer: draft.producer,
        name: draft.name,
        vintageYear: draft.vintageYear,
        region: draft.region,
        country: draft.countryIso2,
        wineType: draft.wineType,
        quantity: draft.quantity,
      })
      setItems((prev) => prev.map((i) => (i.id === editingId ? updated.data : i)))
      setEditingId(null)
      setDraft({})
    } catch (err) {
      console.error(err)
    }
  }

  const requestDelete = (item: CellarItem) => {
    setDeleteTargetId(item.id)
    setDeleteTargetLabel(`${item.producer} ${item.name}${item.vintageYear ? ` ${item.vintageYear}` : ''}`)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTargetId) return
    try {
      await wineCellarApi.remove(deleteTargetId)
      setItems((prev) => prev.filter((i) => i.id !== deleteTargetId))
    } catch (err) {
      console.error(err)
    } finally {
      setDeleteConfirmOpen(false)
      setDeleteTargetId(null)
      setDeleteTargetLabel('')
    }
  }

  const toggleCol = (key: string) => {
    setSettings((s) => {
      const visible = s.visibleCols.includes(key)
        ? s.visibleCols.filter((c) => c !== key)
        : [...s.visibleCols, key]
      const next = { ...s, visibleCols: visible }
      saveSettings(next)
      return next
    })
  }

  const moveCol = (key: string, dir: -1 | 1) => {
    setSettings((s) => {
      const order = [...s.colOrder]
      const idx = order.indexOf(key)
      if (idx < 0) return s
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= order.length) return s
      ;[order[idx], order[newIdx]] = [order[newIdx], order[idx]]
      const next = { ...s, colOrder: order }
      saveSettings(next)
      return next
    })
  }

  const orderedCols = settings.colOrder.filter((k) => settings.visibleCols.includes(k))

  const clearFilters = () => {
    setSearch('')
    setFilterType('')
    setFilterCountry('')
    setFilterRegion('')
    setFilterGrape('')
  }

  const hasFilters = search || filterType || filterCountry || filterRegion || filterGrape

  const exportToXlsx = () => {
    const WINE_TYPE_RU: Record<string, string> = {
      RED: 'Красное', WHITE: 'Белое', ROSE: 'Розовое',
      SPARKLING: 'Игристое', SWEET: 'Десертное', FORTIFIED: 'Креплёное', OTHER: 'Другое',
    }
    const rows = sorted.map((item, idx) => ({
      '№': idx + 1,
      'Производитель': item.producer,
      'Название': item.name,
      'Год урожая': item.vintageYear ?? '',
      'Страна': item.country ?? '',
      'Регион': item.region ?? '',
      'Тип вина': item.wineType ? (WINE_TYPE_RU[item.wineType] ?? item.wineType) : '',
      'Сорта винограда': item.grapes?.join(', ') ?? '',
      'Количество (бут.)': item.quantity,
      'Дата добавления': item.createdAt
        ? new Date(item.createdAt).toLocaleDateString('ru-RU')
        : '',
      'Фото URL': item.photoPath
        ? (item.photoPath.startsWith('http') ? item.photoPath : `${env.API_URL}/${item.photoPath}`)
        : '',
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 4 },  // №
      { wch: 22 }, // Производитель
      { wch: 32 }, // Название
      { wch: 10 }, // Год
      { wch: 16 }, // Страна
      { wch: 20 }, // Регион
      { wch: 12 }, // Тип вина
      { wch: 34 }, // Сорта винограда
      { wch: 14 }, // Количество
      { wch: 16 }, // Дата
      { wch: 55 }, // Фото URL
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Погреб')
    const date = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `enolo-cellar-${date}.xlsx`)
  }

  if (loading) {
    return (
      <Container maxWidth={false} sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
        Загрузка...
      </Container>
    )
  }

  return (
    <Container maxWidth={false} sx={{ py: 2, px: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Поиск по названию и винтажу..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          sx={{ minWidth: 200, '& .MuiOutlinedInput-root': { bgcolor: 'white', fontSize: '14px' } }}
        />

        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel sx={{ fontSize: '14px' }}>Тип</InputLabel>
          <Select value={filterType} label="Тип" onChange={(e) => setFilterType(e.target.value)} sx={{ bgcolor: 'white', fontSize: '14px', '& .MuiSelect-select': { color: 'text.secondary' } }}>
            <MenuItem value="">Все</MenuItem>
            {['RED', 'WHITE', 'ROSE', 'SPARKLING', 'SWEET', 'FORTIFIED', 'OTHER'].map((t) => (
              <MenuItem key={t} value={t} sx={{ fontSize: '14px' }}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ fontSize: '14px' }}>Страна</InputLabel>
          <Select value={filterCountry} label="Страна" onChange={(e) => setFilterCountry(e.target.value)} sx={{ bgcolor: 'white', fontSize: '14px', '& .MuiSelect-select': { color: 'text.secondary' } }}>
            <MenuItem value="">Все</MenuItem>
            {[...new Set(items.map((i) => i.country).filter(Boolean))].sort().map((c) => (
              <MenuItem key={c} value={c} sx={{ fontSize: '14px' }}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ fontSize: '14px' }}>Регион</InputLabel>
          <Select value={filterRegion} label="Регион" onChange={(e) => setFilterRegion(e.target.value)} sx={{ bgcolor: 'white', fontSize: '14px', '& .MuiSelect-select': { color: 'text.secondary' } }}>
            <MenuItem value="">Все</MenuItem>
            {allRegions.map((r) => (
              <MenuItem key={r} value={r} sx={{ fontSize: '14px' }}>{r}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ fontSize: '14px' }}>Сорт</InputLabel>
          <Select value={filterGrape} label="Сорт" onChange={(e) => setFilterGrape(e.target.value)} sx={{ bgcolor: 'white', fontSize: '14px', '& .MuiSelect-select': { color: 'text.secondary' } }}>
            <MenuItem value="">Все</MenuItem>
            {allGrapes.map((g) => (
              <MenuItem key={g} value={g} sx={{ fontSize: '14px' }}>{g}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {hasFilters && (
          <Button size="small" startIcon={<Clear />} onClick={clearFilters} sx={{ minWidth: 'auto' }}>
            Сбросить
          </Button>
        )}

        <Box sx={{ flex: 1 }} />

        <Tooltip title={`Экспорт в Excel (${sorted.length} позиций)`}>
          <IconButton size="small" onClick={exportToXlsx}>
            <FileDownloadRounded fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Настройка столбцов">
          <IconButton size="small" onClick={(e) => setSettingsAnchor(e.currentTarget)}>
            <SettingsRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Menu
        anchorEl={settingsAnchor}
        open={!!settingsAnchor}
        onClose={() => setSettingsAnchor(null)}
        slotProps={{ paper: { sx: { width: 280, maxHeight: 400 } } }}
      >
        <Typography variant="subtitle2" sx={{ px: 2, py: 1, fontWeight: 600 }}>Столбцы</Typography>
        {COLS.map((col) => (
          <MenuItem key={col.key} dense sx={{ gap: 1, px: 2 }}>
            <Checkbox
              size="small"
              checked={settings.visibleCols.includes(col.key)}
              onChange={() => toggleCol(col.key)}
              sx={{ p: 0 }}
            />
            <Typography variant="body2" sx={{ flex: 1 }}>{col.label}</Typography>
            <IconButton size="small" disabled={settings.colOrder.indexOf(col.key) === 0} onClick={() => moveCol(col.key, -1)}>
              ↑
            </IconButton>
            <IconButton size="small" disabled={settings.colOrder.indexOf(col.key) === settings.colOrder.length - 1} onClick={() => moveCol(col.key, 1)}>
              ↓
            </IconButton>
          </MenuItem>
        ))}
      </Menu>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {orderedCols.map((colKey) => {
                const col = COLS.find((c) => c.key === colKey)!
                return (
                  <TableCell key={colKey} sx={{ fontWeight: 700 }}>
                    <TableSortLabel
                      active={sortState.col === colKey}
                      direction={sortState.col === colKey ? sortState.dir : 'asc'}
                      onClick={() => handleSort(colKey)}
                      sx={{ fontWeight: 700 }}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                )
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={orderedCols.length} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  Ничего не найдено
                </TableCell>
              </TableRow>
            ) : (
              visibleItems.map((item) => (
                <TableRow key={item.id} hover sx={{ height: 48, position: 'relative' }}>
                  {orderedCols.map((colKey, idx) => (
                    <TableCell key={colKey} sx={{ py: 0.5, ...(idx === orderedCols.length - 1 && { pr: 8 }) }}>
                      {editingId === item.id ? (
                        colKey === 'producer' ? (
                          <TextField size="small" value={draft.producer || ''} onChange={(e) => setDraft((d) => ({ ...d, producer: e.target.value }))} sx={{ width: 140, '& .MuiOutlinedInput-root': { fontSize: '14px', bgcolor: 'white' } }} />
                        ) : colKey === 'name' ? (
                          <TextField size="small" value={draft.name || ''} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} sx={{ width: 140, '& .MuiOutlinedInput-root': { fontSize: '14px', bgcolor: 'white' } }} />
                        ) : colKey === 'vintageYear' ? (
                          <TextField size="small" type="number" value={draft.vintageYear || ''} onChange={(e) => setDraft((d) => ({ ...d, vintageYear: e.target.value ? Number(e.target.value) : undefined }))} sx={{ width: 80, '& .MuiOutlinedInput-root': { fontSize: '14px', bgcolor: 'white' } }} />
                        ) : colKey === 'country' ? (
                          <TextField size="small" value={countries.find((c) => c.iso2 === draft.countryIso2)?.name || ''} onChange={(e) => { const match = countries.find((c) => c.name.toLowerCase().includes(e.target.value.toLowerCase())); if (match) setDraft((d) => ({ ...d, countryIso2: match.iso2 })) }} sx={{ width: 120, '& .MuiOutlinedInput-root': { fontSize: '14px', bgcolor: 'white' } }} />
                        ) : colKey === 'region' ? (
                          <TextField size="small" value={draft.region || ''} onChange={(e) => setDraft((d) => ({ ...d, region: e.target.value }))} sx={{ width: 120, '& .MuiOutlinedInput-root': { fontSize: '14px', bgcolor: 'white' } }} />
                        ) : colKey === 'wineType' ? (
                          <FormControl size="small" sx={{ minWidth: 100 }}>
                            <Select
                              value={draft.wineType || item.wineType || 'OTHER'}
                              onChange={(e) => setDraft((d) => ({ ...d, wineType: e.target.value }))}
                              sx={{ fontSize: '14px', bgcolor: 'white', '& .MuiSelect-select': { fontSize: '14px' } }}
                            >
                              {['RED', 'WHITE', 'ROSE', 'SPARKLING', 'SWEET', 'FORTIFIED', 'OTHER'].map((t) => (
                                <MenuItem key={t} value={t} sx={{ fontSize: '14px' }}>{t}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        ) : colKey === 'grapes' ? (
                          <Typography variant="body2">{item.grapes?.join(', ') || '—'}</Typography>
                        ) : colKey === 'quantity' ? (
                          <TextField size="small" type="number" value={draft.quantity || 1} onChange={(e) => setDraft((d) => ({ ...d, quantity: Math.max(1, Number(e.target.value)) }))} sx={{ width: 70, '& .MuiOutlinedInput-root': { fontSize: '14px', bgcolor: 'white' } }} />
                        ) : null
                      ) : (
                        <>
                          {colKey === 'photo' ? (
                            item.photoPath ? (
                              <img
                                src={item.photoPath.startsWith('http') ? item.photoPath : `${env.API_URL}/${item.photoPath}`}
                                alt=""
                                style={{ width: 40, height: 54, objectFit: 'contain', borderRadius: 4, background: '#f5f3f0', display: 'block' }}
                              />
                            ) : (
                              <Typography variant="caption" color="text.disabled">—</Typography>
                            )
                          ) : colKey === 'grapes' ? (
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                              {item.grapes?.map((g) => <Chip key={g} label={g} size="small" variant="outlined" />) || '—'}
                            </Box>
                          ) : colKey === 'wineType' ? (
                            <WineTypeChip type={item.wineType || ''} />
                          ) : colKey === 'vintageYear' ? (
                            item.vintageYear || '—'
                          ) : colKey === 'quantity' ? (
                            <Chip label={`${item.quantity} шт.`} size="small" sx={{ bgcolor: '#f5f5f5', color: '#616161', fontWeight: 600 }} />
                          ) : (
                            (item as any)[colKey] || '—'
                          )}
                        </>
                      )}
                    </TableCell>
                  ))}
                  <Box
                    sx={{
                      position: 'absolute',
                      right: 0,
                      top: 2,
                      bottom: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      opacity: 0,
                      transition: 'opacity 0.15s',
                      bgcolor: editingId === item.id ? 'transparent' : '#f5f5f5',
                      px: 0.5,
                      '.MuiTableRow-root:hover &': { opacity: 1 },
                      ...(editingId === item.id && { opacity: 1 }),
                    }}
                  >
                    {editingId === item.id ? (
                      <>
                        <IconButton size="small" onClick={saveEdit} title="Применить" color="success" sx={{ bgcolor: 'transparent' }}>
                          <Check fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => { setEditingId(null); setDraft({}) }} title="Отмена" color="error" sx={{ bgcolor: 'transparent' }}>
                          <Cancel fontSize="small" />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <Tooltip title="Загрузить фото">
                          <IconButton size="small" onClick={() => handleUploadPhoto(item)} sx={{ bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}>
                            {uploadingPhotoId === item.id ? <CircularProgress size={16} /> : <PhotoCamera fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Найти фото в сети">
                          <IconButton size="small" onClick={() => handleFetchPhoto(item)} sx={{ bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}>
                            {fetchingPhotoId === item.id ? <CircularProgress size={16} /> : <CloudDownload fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Копировать">
                          <IconButton size="small" onClick={() => copyWineInfo(item)} sx={{ bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}>
                            <ContentCopyRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={hasNoteMap[item.id] ? 'Комментарий' : 'Добавить комментарий'}>
                          <IconButton size="small" onClick={() => openComment(item)} sx={{ bgcolor: hasNoteMap[item.id] ? 'primary.light' : 'action.hover', '&:hover': { bgcolor: hasNoteMap[item.id] ? 'primary.main' : 'action.selected' } }}>
                            {hasNoteMap[item.id] ? <ChatRounded fontSize="small" sx={{ color: '#fff' }} /> : <ChatOutlined fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                        <IconButton size="small" onClick={() => startEdit(item)} sx={{ bgcolor: 'action.hover', '&:hover': { bgcolor: 'action.selected' } }}>
                          <EditRounded fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => requestDelete(item)} sx={{ bgcolor: 'error.light', color: '#fff', '&:hover': { bgcolor: 'error.main' } }}>
                          <DeleteRounded fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </Box>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {visibleItems.length} из {sorted.length} {visibleCount < sorted.length && `(загружено ${visibleCount})`}
      </Typography>

      <CommentModal
        open={!!commentItemId}
        itemId={commentItemId}
        wineLabel={commentWineLabel}
        onClose={() => setCommentItemId(null)}
        onSaved={() => setHasNoteMap((m) => ({ ...m, [commentItemId || '']: true }))}
      />

      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Удалить вино?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Вы действительно хотите удалить <strong>{deleteTargetLabel}</strong> из погреба?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Отмена</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Удалить</Button>
        </DialogActions>
      </Dialog>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoFile}
      />
    </Container>
  )
}

export default CellarPage
