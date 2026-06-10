import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Box, Container, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, Paper, TextField,
  IconButton, Chip, Button,
  FormControl, InputLabel, Select, MenuItem, Typography, Link,
  CircularProgress, Switch, ListItemText, Checkbox, Divider,
  OutlinedInput, ListSubheader, Popover, Tooltip,
} from '@mui/material'
import {
  Search as SearchIcon, Clear, Refresh, Settings as SettingsIcon,
  KeyboardArrowUp, KeyboardArrowDown,
} from '@mui/icons-material'
import { discountsApi, type DiscountOffer, type DiscountFilters, storesApi, type Store } from '../shared/api/discounts'

// Russian labels for the wine type shown on the wine's second line.
const TYPE_LABEL_RU: Record<string, string> = {
  RED: 'Красное',
  WHITE: 'Белое',
  ROSE: 'Розовое',
  SPARKLING: 'Игристое',
  SWEET: 'Десертное',
  FORTIFIED: 'Креплёное',
  ORANGE: 'Оранжевое',
  OTHER: '',
}

// Country (Russian name) → ISO 3166-1 alpha-2 code for the flag icon.
const COUNTRY_CODE: Record<string, string> = {
  'аргентина': 'ar', 'австралия': 'au', 'австрия': 'at', 'армения': 'am',
  'болгария': 'bg', 'венгрия': 'hu', 'германия': 'de', 'грузия': 'ge',
  'греция': 'gr', 'израиль': 'il', 'испания': 'es', 'италия': 'it',
  'кипр': 'cy', 'ливан': 'lb', 'македония': 'mk', 'молдавия': 'md', 'молдова': 'md',
  'новая зеландия': 'nz', 'португалия': 'pt', 'россия': 'ru', 'российская федерация': 'ru',
  'румыния': 'ro', 'сербия': 'rs', 'словакия': 'sk', 'словения': 'si',
  'сша': 'us', 'турция': 'tr', 'украина': 'ua', 'франция': 'fr', 'хорватия': 'hr',
  'черногория': 'me', 'чехия': 'cz', 'чили': 'cl', 'швейцария': 'ch',
  'юар': 'za', 'южная африка': 'za', 'южно-африканская республика': 'za',
}

const countryCode = (c?: string | null): string | undefined =>
  c ? COUNTRY_CODE[c.trim().toLowerCase()] : undefined

const CountryFlag = ({ country }: { country?: string | null }) => {
  const code = countryCode(country)
  if (!code) return null
  return (
    <img
      src={`https://flagcdn.com/24x18/${code}.png`}
      srcSet={`https://flagcdn.com/48x36/${code}.png 2x`}
      width={20}
      height={15}
      alt={country || ''}
      title={country || ''}
      loading="lazy"
      style={{ borderRadius: 2, flexShrink: 0, objectFit: 'cover', display: 'block' }}
    />
  )
}

// ── Wine cell: country flag + name + (type, volume) second line ───────────────
const WineCellContent = ({ o }: { o: DiscountOffer }) => {
  const t = o.wineType ? (TYPE_LABEL_RU[o.wineType] ?? '') : ''
  const v = o.volumeMl ? `объём ${(o.volumeMl / 1000).toString()}` : ''
  const line = [t, v].filter(Boolean).join(', ')
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, minWidth: 0 }}>
      <Box sx={{ pt: '3px' }}>
        <CountryFlag country={o.country} />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Link href={o.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontSize: '0.875rem', color: 'text.primary', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', '&:hover': { color: 'primary.main' } }}>
          {o.wineName || o.wineNameRaw}
        </Link>
        {line ? (
          <Typography sx={{ display: 'block', fontStyle: 'italic', color: 'text.secondary', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {line}
          </Typography>
        ) : null}
      </Box>
    </Box>
  )
}

const litres = (ml: number | null) => (ml ? `${(ml / 1000).toString()} л` : '—')

const ThumbnailCell = ({ url }: { url: string | null | undefined }) => {
  if (!url) return (
    <Box sx={{ width: 40, height: 54, bgcolor: '#f0eeeb', borderRadius: 1, flexShrink: 0 }} />
  )
  return (
    <Box
      component="img"
      src={url}
      alt=""
      onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.style.display = 'none'
      }}
      sx={{ width: 40, height: 54, objectFit: 'contain', borderRadius: 1, bgcolor: '#f9f8f6', display: 'block', flexShrink: 0 }}
    />
  )
}

// ── Column registry: single source of truth for the table & the settings menu ──
interface ColumnDef {
  id: string
  label: string
  defaultVisible: boolean
  defaultWidth: number
  align?: 'left' | 'right'
  sortKey?: string
  noEllipsis?: boolean // multi-line cell (e.g. Wine) — don't force nowrap/ellipsis on the cell
  title?: (o: DiscountOffer) => string | undefined
  render: (o: DiscountOffer) => React.ReactNode
}

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'thumbnail', label: '', defaultVisible: true, defaultWidth: 56, noEllipsis: true, render: (o) => <ThumbnailCell url={o.imageUrl} /> },
  { id: 'seller', label: 'Продавец', defaultVisible: true, defaultWidth: 130, title: (o) => o.sellerName, render: (o) => o.sellerName },
  { id: 'wine', label: 'Вино', defaultVisible: true, defaultWidth: 455, noEllipsis: true, title: (o) => o.wineName || o.wineNameRaw || undefined, render: (o) => <WineCellContent o={o} /> },
  { id: 'vintage', label: 'Год', defaultVisible: true, defaultWidth: 70, render: (o) => o.vintage || '—' },
  { id: 'country', label: 'Страна', defaultVisible: false, defaultWidth: 120, title: (o) => o.country || undefined, render: (o) => o.country || '—' },
  { id: 'type', label: 'Тип', defaultVisible: false, defaultWidth: 90, render: (o) => (o.wineType ? TYPE_LABEL_RU[o.wineType] || o.wineType : '—') },
  { id: 'volume', label: 'Объём', defaultVisible: false, defaultWidth: 75, render: (o) => litres(o.volumeMl) },
  { id: 'region', label: 'Регион', defaultVisible: false, defaultWidth: 140, title: (o) => o.regionCanonical || o.region || undefined, render: (o) => o.regionCanonical || o.region || '—' },
  { id: 'appellation', label: 'Апелласьон', defaultVisible: false, defaultWidth: 140, title: (o) => o.appellation || undefined, render: (o) => o.appellation || '—' },
  { id: 'grapes', label: 'Сорта винограда', defaultVisible: true, defaultWidth: 160, noEllipsis: true, title: (o) => (o.grapes && o.grapes.length ? o.grapes.join(', ') : undefined), render: (o) => (o.grapes && o.grapes.length ? <Box sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', fontSize: '0.875rem', lineHeight: 1.3 }}>{o.grapes.join(', ')}</Box> : '—') },
  { id: 'sweetness', label: 'Сладость', defaultVisible: false, defaultWidth: 100, render: (o) => o.sweetness || '—' },
  { id: 'alcohol', label: 'Крепость', defaultVisible: false, defaultWidth: 80, align: 'right', render: (o) => (o.alcohol != null ? `${o.alcohol}%` : '—') },
  { id: 'ageingVessel', label: 'Выдержка (ёмкость)', defaultVisible: false, defaultWidth: 150, title: (o) => o.ageingVessel || undefined, render: (o) => o.ageingVessel || '—' },
  { id: 'storagePotential', label: 'Потенциал хранения', defaultVisible: false, defaultWidth: 150, title: (o) => o.storagePotential || undefined, render: (o) => o.storagePotential || '—' },
  { id: 'description', label: 'Описание', defaultVisible: false, defaultWidth: 260, title: (o) => o.description || undefined, render: (o) => o.description || '—' },
  {
    id: 'currentPrice', label: 'Цена', defaultVisible: true, defaultWidth: 100, align: 'right', sortKey: 'currentPrice', noEllipsis: true,
    render: (o) => (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{Math.round(o.currentPrice).toLocaleString('ru-RU')}</Typography>
        {o.oldPrice ? (
          <Typography variant="caption" sx={{ textDecoration: 'line-through', color: 'text.secondary', display: 'block', lineHeight: 1.2 }}>
            {Math.round(o.oldPrice).toLocaleString('ru-RU')}
          </Typography>
        ) : null}
      </Box>
    ),
  },
  { id: 'discountPercent', label: '%', defaultVisible: true, defaultWidth: 80, align: 'right', sortKey: 'discountPercent', render: (o) => (o.discountPercent ? <Chip label={`-${o.discountPercent}%`} size="small" sx={{ bgcolor: o.discountPercent < 30 ? '#e8f5e9' : o.discountPercent < 45 ? '#fff9c4' : '#ffebee', color: o.discountPercent < 30 ? '#2e7d32' : o.discountPercent < 45 ? '#f57f17' : '#c62828', fontWeight: 700 }} /> : '—') },
]

const COLUMN_BY_ID: Record<string, ColumnDef> = Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, c]))
const DEFAULT_WIDTHS: Record<string, number> = Object.fromEntries(ALL_COLUMNS.map((c) => [c.id, c.defaultWidth]))

const STORAGE_KEY = 'discounts_column_widths_v4'
const PREFS_KEY = 'discounts_column_prefs_v3'

interface ColumnPref { id: string; visible: boolean }

const loadColumnWidths = (): Record<string, number> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...DEFAULT_WIDTHS, ...JSON.parse(stored) }
  } catch {}
  return { ...DEFAULT_WIDTHS }
}

const saveColumnWidths = (widths: Record<string, number>) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widths)) } catch {}
}

// Column order + visibility. Stored prefs are reconciled with ALL_COLUMNS so newly
// added columns appear (at the end) and removed ones are dropped.
const defaultPrefs = (): ColumnPref[] => ALL_COLUMNS.map((c) => ({ id: c.id, visible: c.defaultVisible }))

const loadColumnPrefs = (): ColumnPref[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')
    if (Array.isArray(stored)) {
      const valid = stored.filter((p: any) => p && COLUMN_BY_ID[p.id])
      const seen = new Set(valid.map((p: any) => p.id))
      const missing = defaultPrefs().filter((d) => !seen.has(d.id))
      return [...valid.map((p: any) => ({ id: p.id, visible: !!p.visible })), ...missing]
    }
  } catch {}
  return defaultPrefs()
}

const saveColumnPrefs = (prefs: ColumnPref[]) => {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch {}
}

const DiscountsPage = () => {
  const [offers, setOffers] = useState<DiscountOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [filterWineType, setFilterWineType] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterMinDiscount, setFilterMinDiscount] = useState('')
  const [filterMinPrice, setFilterMinPrice] = useState('')
  const [filterMaxPrice, setFilterMaxPrice] = useState('')
  const [filterSeller, setFilterSeller] = useState('')
  const [filterGrapes, setFilterGrapes] = useState<string[]>([])
  const [filterMonosort, setFilterMonosort] = useState(false)
  const [grapeSearch, setGrapeSearch] = useState('')
  const [stores, setStores] = useState<Store[]>([])
  const [sortState, setSortState] = useState('discountPercent_desc')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(loadColumnWidths)
  const [columnPrefs, setColumnPrefs] = useState<ColumnPref[]>(loadColumnPrefs)
  const [colMenuAnchor, setColMenuAnchor] = useState<HTMLElement | null>(null)
  const limit = 50

  const visibleColumns = useMemo(
    () => columnPrefs.filter((p) => p.visible).map((p) => COLUMN_BY_ID[p.id]).filter(Boolean),
    [columnPrefs],
  )

  // Exact total table width = sum of visible column widths. Pinning it (instead of
  // width:100%) stops the fixed-layout "distribute leftover space" behaviour, so
  // header and body columns line up pixel-for-pixel and resizing is predictable.
  const totalTableWidth = useMemo(
    () => visibleColumns.reduce((sum, c) => sum + (columnWidths[c.id] || DEFAULT_WIDTHS[c.id] || 100), 0),
    [visibleColumns, columnWidths],
  )

  const toggleColumn = (id: string) =>
    setColumnPrefs((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p))
      saveColumnPrefs(next)
      return next
    })

  const moveColumn = (id: string, dir: -1 | 1) =>
    setColumnPrefs((prev) => {
      const i = prev.findIndex((p) => p.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      saveColumnPrefs(next)
      return next
    })

  const resetColumns = () => {
    const next = defaultPrefs()
    saveColumnPrefs(next)
    setColumnPrefs(next)
  }

  const hasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const pageRef = useRef(1)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resizeRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null)

  hasMoreRef.current = hasMore
  loadingMoreRef.current = loadingMore
  pageRef.current = page

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const resize = resizeRef.current
      if (!resize) return
      const delta = e.clientX - resize.startX
      const newWidth = Math.max(40, resize.startWidth + delta)
      const colKey = resize.colKey
      setColumnWidths((prev) => {
        const next = { ...prev, [colKey]: newWidth }
        saveColumnWidths(next)
        return next
      })
    }

    const handleMouseUp = () => {
      resizeRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault()
    resizeRef.current = { colKey, startX: e.clientX, startWidth: columnWidths[colKey] || DEFAULT_WIDTHS[colKey] }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const buildFilters = useCallback((): DiscountFilters => {
    const filters: DiscountFilters = { page: 1, limit, sort: sortState }
    if (search) filters.search = search
    if (filterWineType) filters.wineType = filterWineType
    if (filterCountry) filters.country = filterCountry
    if (filterMinDiscount) filters.minDiscount = parseInt(filterMinDiscount, 10)
    if (filterMinPrice) filters.minPrice = parseInt(filterMinPrice, 10)
    if (filterMaxPrice) filters.maxPrice = parseInt(filterMaxPrice, 10)
    if (filterSeller) filters.seller = filterSeller
    if (filterGrapes.length > 0) filters.grapes = filterGrapes.join(',')
    if (filterMonosort) filters.monosort = true
    return filters
  }, [search, filterWineType, filterCountry, filterMinDiscount, filterMinPrice, filterMaxPrice, filterSeller, filterGrapes, filterMonosort, sortState])

  const loadFirstPage = useCallback(async () => {
    setLoading(true)
    setOffers([])
    setPage(1)
    pageRef.current = 1
    setHasMore(true)
    hasMoreRef.current = true
    try {
      const filters = buildFilters()
      const { data } = await discountsApi.getOffers(filters)
      setOffers(data.items)
      setTotal(data.total)
      const more = data.items.length >= limit
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [buildFilters])

  const debouncedLoadFirstPage = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      loadFirstPage()
    }, 800)
  }, [loadFirstPage])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const nextPage = pageRef.current + 1
      const filters = buildFilters()
      filters.page = nextPage
      const { data } = await discountsApi.getOffers(filters)
      setOffers((prev) => [...prev, ...data.items])
      setPage(nextPage)
      pageRef.current = nextPage
      const more = data.items.length >= limit
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error(err)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [buildFilters])

  useEffect(() => {
    storesApi.list().then((r) => setStores(r.data)).catch(() => setStores([]))
  }, [])

  useEffect(() => {
    debouncedLoadFirstPage()
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [debouncedLoadFirstPage])

  useEffect(() => {
    const handleScroll = () => {
      if (loadingMoreRef.current || !hasMoreRef.current) return
      const scrollY = window.scrollY || window.pageYOffset
      const windowHeight = window.innerHeight
      const docHeight = document.documentElement.scrollHeight
      if (scrollY + windowHeight >= docHeight - 400) {
        loadMore()
      }
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [loadMore])

  const handleSort = (col: string) => {
    const dir = sortState.endsWith('_desc') ? 'asc' : 'desc'
    setSortState(`${col}_${dir}`)
  }

  const clearFilters = () => {
    setSearch('')
    setFilterWineType('')
    setFilterCountry('')
    setFilterMinDiscount('')
    setFilterMinPrice('')
    setFilterMaxPrice('')
    setFilterSeller('')
    setFilterGrapes([])
    setFilterMonosort(false)
    setPage(1)
  }

  const hasFilters = search || filterWineType || filterCountry || filterMinDiscount || filterMinPrice || filterMaxPrice || filterSeller || filterGrapes.length > 0 || filterMonosort

  const countries = useMemo(() => {
    const set = new Set<string>()
    offers.forEach((o) => o.country && set.add(o.country))
    return [...set].sort()
  }, [offers])

  const availableGrapes = useMemo(() => {
    const set = new Set<string>()
    offers.forEach((o) => o.grapes?.forEach((g) => set.add(g)))
    return [...set].sort()
  }, [offers])

  const filteredGrapes = useMemo(() => {
    if (!grapeSearch) return availableGrapes
    const q = grapeSearch.toLowerCase()
    return availableGrapes.filter((g) => g.toLowerCase().includes(q))
  }, [availableGrapes, grapeSearch])

  const cw = columnWidths

  const ResizeHandle = ({ colKey }: { colKey: string }) => (
    <div
      onMouseDown={(e) => handleResizeStart(colKey, e)}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 4,
        cursor: 'col-resize',
        zIndex: 1,
      }}
    />
  )

  if (loading && offers.length === 0) {
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
          placeholder="Поиск по названию или производителю..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          slotProps={{ input: { startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          sx={{ minWidth: 250, '& .MuiOutlinedInput-root': { bgcolor: 'white', fontSize: '14px' } }}
        />

        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel sx={{ fontSize: '14px' }}>Тип</InputLabel>
          <Select value={filterWineType} label="Тип" onChange={(e) => { setFilterWineType(e.target.value); setPage(1) }} sx={{ bgcolor: 'white', fontSize: '14px', '& .MuiSelect-select': { color: 'text.secondary' } }}>
            <MenuItem value="">Все</MenuItem>
            {['RED', 'WHITE', 'ROSE', 'SPARKLING', 'SWEET', 'FORTIFIED', 'OTHER'].map((t) => (
              <MenuItem key={t} value={t} sx={{ fontSize: '14px' }}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ fontSize: '14px' }}>Страна</InputLabel>
          <Select value={filterCountry} label="Страна" onChange={(e) => { setFilterCountry(e.target.value); setPage(1) }} sx={{ bgcolor: 'white', fontSize: '14px', '& .MuiSelect-select': { color: 'text.secondary' } }}>
            <MenuItem value="">Все</MenuItem>
            {countries.map((c) => (
              <MenuItem key={c} value={c} sx={{ fontSize: '14px' }}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          type="number"
          placeholder="Скидка от %"
          value={filterMinDiscount}
          onChange={(e) => { setFilterMinDiscount(e.target.value); setPage(1) }}
          sx={{ width: 110, '& .MuiOutlinedInput-root': { bgcolor: 'white', fontSize: '14px' } }}
        />

        <TextField
          size="small"
          type="number"
          placeholder="Цена от"
          value={filterMinPrice}
          onChange={(e) => { setFilterMinPrice(e.target.value); setPage(1) }}
          sx={{ width: 90, '& .MuiOutlinedInput-root': { bgcolor: 'white', fontSize: '14px' } }}
        />

        <TextField
          size="small"
          type="number"
          placeholder="Цена до"
          value={filterMaxPrice}
          onChange={(e) => { setFilterMaxPrice(e.target.value); setPage(1) }}
          sx={{ width: 90, '& .MuiOutlinedInput-root': { bgcolor: 'white', fontSize: '14px' } }}
        />

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel sx={{ fontSize: '14px' }}>Продавец</InputLabel>
          <Select value={filterSeller} label="Продавец" onChange={(e) => { setFilterSeller(e.target.value); setPage(1) }} sx={{ bgcolor: 'white', fontSize: '14px', '& .MuiSelect-select': { color: 'text.secondary' } }}>
            <MenuItem value="">Все</MenuItem>
            {stores.map((s) => (
              <MenuItem key={s.id} value={s.name} sx={{ fontSize: '14px' }}>{s.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Grape variety filter with monosort toggle inside */}
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel sx={{ fontSize: '14px' }}>Сорта винограда</InputLabel>
          <Select
            multiple
            value={filterGrapes}
            label="Сорта винограда"
            onClose={() => setGrapeSearch('')}
            onChange={(e) => {
              const vals = typeof e.target.value === 'string'
                ? e.target.value.split(',')
                : (e.target.value as string[])
              if (vals.includes('__monosort__')) {
                setFilterMonosort(prev => !prev)
                setFilterGrapes(vals.filter(v => v !== '__monosort__'))
              } else {
                setFilterGrapes(vals)
              }
              setPage(1)
            }}
            input={<OutlinedInput label="Сорта винограда" />}
            renderValue={(selected) => {
              const vals = (selected as string[]).filter(v => v !== '__monosort__')
              const label = vals.slice(0, 2).join(', ') + (vals.length > 2 ? ` +${vals.length - 2}` : '')
              if (!label && filterMonosort) return 'Моносортовые'
              if (filterMonosort) return `${label} · Моносорт`
              return label
            }}
            sx={{ bgcolor: 'white', fontSize: '14px' }}
          >
            {/* Monosort toggle as first item */}
            <MenuItem
              value="__monosort__"
              sx={{ fontSize: '14px', py: 0.5, gap: 1 }}
            >
              <Switch size="small" checked={filterMonosort} tabIndex={-1} disableRipple />
              <ListItemText primary="Моносортовое" primaryTypographyProps={{ fontSize: '14px' }} />
            </MenuItem>
            <Divider />
            <ListSubheader sx={{ p: 1, lineHeight: 'normal', bgcolor: 'background.paper' }}>
              <TextField
                size="small"
                placeholder="Поиск сорта..."
                value={grapeSearch}
                onChange={(e) => setGrapeSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                fullWidth
                slotProps={{ input: { style: { fontSize: '13px' } } }}
              />
            </ListSubheader>
            {filteredGrapes.map((g) => (
              <MenuItem key={g} value={g} sx={{ fontSize: '14px', py: 0.5 }}>
                <Checkbox checked={filterGrapes.includes(g)} size="small" sx={{ py: 0 }} />
                <ListItemText primary={g} primaryTypographyProps={{ fontSize: '14px' }} />
              </MenuItem>
            ))}
            {availableGrapes.length === 0 && (
              <MenuItem disabled sx={{ fontSize: '14px' }}>Нет данных о сортах</MenuItem>
            )}
            {availableGrapes.length > 0 && filteredGrapes.length === 0 && (
              <MenuItem disabled sx={{ fontSize: '14px' }}>Ничего не найдено</MenuItem>
            )}
          </Select>
        </FormControl>

        {hasFilters && (
          <Button size="small" startIcon={<Clear />} onClick={clearFilters} sx={{ minWidth: 'auto' }}>
            Сбросить
          </Button>
        )}

        <Box sx={{ flex: 1 }} />

        <IconButton size="small" onClick={loadFirstPage}>
          <Refresh fontSize="small" />
        </IconButton>
        <Tooltip title="Настроить столбцы">
          <IconButton size="small" onClick={(e) => setColMenuAnchor(e.currentTarget)}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Popover
        open={Boolean(colMenuAnchor)}
        anchorEl={colMenuAnchor}
        onClose={() => setColMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ width: 290, py: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.5 }}>
            <Typography variant="subtitle2">Столбцы таблицы</Typography>
            <Button size="small" onClick={resetColumns}>Сбросить</Button>
          </Box>
          <Divider />
          <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
            {columnPrefs.map((p, i) => {
              const col = COLUMN_BY_ID[p.id]
              if (!col) return null
              return (
                <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.25, pl: 0.5, pr: 1 }}>
                  <Checkbox size="small" checked={p.visible} onChange={() => toggleColumn(p.id)} />
                  <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</Typography>
                  <IconButton size="small" disabled={i === 0} onClick={() => moveColumn(p.id, -1)}>
                    <KeyboardArrowUp fontSize="small" />
                  </IconButton>
                  <IconButton size="small" disabled={i === columnPrefs.length - 1} onClick={() => moveColumn(p.id, 1)}>
                    <KeyboardArrowDown fontSize="small" />
                  </IconButton>
                </Box>
              )
            })}
          </Box>
        </Box>
      </Popover>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" sx={{ tableLayout: 'fixed', width: '100%', minWidth: totalTableWidth }}>
          <TableHead>
            <TableRow>
              {visibleColumns.map((col, idx) => (
                <TableCell
                  key={col.id}
                  align={col.align}
                  sx={{ fontWeight: 700, width: cw[col.id], minWidth: cw[col.id], boxSizing: 'border-box', position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {col.sortKey ? (
                    <TableSortLabel active={sortState.startsWith(col.sortKey)} direction={sortState.endsWith('_desc') ? 'desc' : 'asc'} onClick={() => handleSort(col.sortKey!)}>
                      {col.label}
                    </TableSortLabel>
                  ) : col.label}
                  {idx < visibleColumns.length - 1 && <ResizeHandle colKey={col.id} />}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {offers.map((offer, idx) => (
              <TableRow key={`${offer.id}-${idx}`} hover sx={{ bgcolor: offer.confidence === 'low' ? '#fff8e1' : undefined }}>
                {visibleColumns.map((col) => (
                  <TableCell
                    key={col.id}
                    align={col.align}
                    title={col.title?.(offer)}
                    sx={{ py: 0.5, width: cw[col.id], minWidth: cw[col.id], boxSizing: 'border-box', overflow: 'hidden', ...(col.noEllipsis ? {} : { textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}
                  >
                    {col.render(offer)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {offers.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  Скидок не найдено
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {offers.length} из {total}
        </Typography>
        {loadingMore && <CircularProgress size={20} />}
      </Box>
    </Container>
  )
}

export default DiscountsPage
