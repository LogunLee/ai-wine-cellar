import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Box, Container, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, Paper, TextField,
  IconButton, Chip, Button,
  FormControl, InputLabel, Select, MenuItem, Typography, Link,
  CircularProgress,
} from '@mui/material'
import {
  Search as SearchIcon, Clear, Refresh,
} from '@mui/icons-material'
import { discountsApi, type DiscountOffer, type DiscountFilters, storesApi, type Store } from '../shared/api/discounts'

const WINE_TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  RED: { bg: '#fde8e8', color: '#8b0000' },
  WHITE: { bg: '#fff9c4', color: '#827717' },
  ROSE: { bg: '#fce4ec', color: '#ad1457' },
  SPARKLING: { bg: '#fff9c4', color: '#827717' },
  SWEET: { bg: '#fff3e0', color: '#e65100' },
  FORTIFIED: { bg: '#efebe9', color: '#4e342e' },
  OTHER: { bg: '#f5f5f5', color: '#616161' },
}

const WineTypeChip = ({ type }: { type: string }) => {
  const s = WINE_TYPE_STYLES[type] || WINE_TYPE_STYLES.OTHER
  return (
    <Chip
      label={type}
      size="small"
      sx={{ bgcolor: s.bg, color: s.color, fontWeight: 600, fontSize: '0.75rem' }}
    />
  )
}

const COLUMN_KEYS = ['seller', 'wine', 'vintage', 'country', 'type', 'volume', 'oldPrice', 'currentPrice', 'discountPercent']
const DEFAULT_WIDTHS: Record<string, number> = {
  seller: 130,
  wine: 250,
  vintage: 60,
  country: 110,
  type: 70,
  volume: 55,
  oldPrice: 70,
  currentPrice: 60,
  discountPercent: 70,
}

const STORAGE_KEY = 'discounts_column_widths'

const loadColumnWidths = (): Record<string, number> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return { ...DEFAULT_WIDTHS }
}

const saveColumnWidths = (widths: Record<string, number>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
  } catch {}
}

const EllipsisCell = ({ text, width, align }: { text: string | null; width: number; align?: 'left' | 'right' }) => (
  <TableCell
    sx={{
      py: 0.5,
      maxWidth: width,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      textAlign: align || 'left',
    }}
    title={text || undefined}
  >
    {text || '—'}
  </TableCell>
)

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
  const [stores, setStores] = useState<Store[]>([])
  const [sortState, setSortState] = useState('discountPercent_desc')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(loadColumnWidths)
  const limit = 50

  const hasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const pageRef = useRef(1)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resizeRef = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null)

  hasMoreRef.current = hasMore
  loadingMoreRef.current = loadingMore
  pageRef.current = page

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const resize = resizeRef.current
      if (!resize) return
      const delta = e.clientX - resize.startX
      const newWidth = Math.max(40, resize.startWidth + delta)
      const colKey = COLUMN_KEYS[resize.colIndex]
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

  const handleResizeStart = (colIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    const colKey = COLUMN_KEYS[colIndex]
    resizeRef.current = { colIndex, startX: e.clientX, startWidth: columnWidths[colKey] || DEFAULT_WIDTHS[colKey] }
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
    return filters
  }, [search, filterWineType, filterCountry, filterMinDiscount, filterMinPrice, filterMaxPrice, filterSeller, sortState])

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
    setPage(1)
  }

  const hasFilters = search || filterWineType || filterCountry || filterMinDiscount || filterMinPrice || filterMaxPrice || filterSeller

  const countries = useMemo(() => {
    const set = new Set<string>()
    offers.forEach((o) => o.country && set.add(o.country))
    return [...set].sort()
  }, [offers])

  const cw = columnWidths

  const ResizeHandle = ({ colIndex }: { colIndex: number }) => (
    <div
      onMouseDown={(e) => handleResizeStart(colIndex, e)}
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

        {hasFilters && (
          <Button size="small" startIcon={<Clear />} onClick={clearFilters} sx={{ minWidth: 'auto' }}>
            Сбросить
          </Button>
        )}

        <Box sx={{ flex: 1 }} />

        <IconButton size="small" onClick={loadFirstPage}>
          <Refresh fontSize="small" />
        </IconButton>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: cw.seller, minWidth: cw.seller, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                Продавец
                <ResizeHandle colIndex={0} />
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: cw.wine, minWidth: cw.wine, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                Вино
                <ResizeHandle colIndex={1} />
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: cw.vintage, minWidth: cw.vintage, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                Винтаж
                <ResizeHandle colIndex={2} />
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: cw.country, minWidth: cw.country, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                Страна
                <ResizeHandle colIndex={3} />
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: cw.type, minWidth: cw.type, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                Тип
                <ResizeHandle colIndex={4} />
              </TableCell>
              <TableCell sx={{ fontWeight: 700, width: cw.volume, minWidth: cw.volume, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                Объём
                <ResizeHandle colIndex={5} />
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, width: cw.oldPrice, minWidth: cw.oldPrice, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <TableSortLabel active={sortState.startsWith('oldPrice')} direction={sortState.endsWith('_desc') ? 'desc' : 'asc'} onClick={() => handleSort('oldPrice')}>
                  Цена до
                </TableSortLabel>
                <ResizeHandle colIndex={6} />
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, width: cw.currentPrice, minWidth: cw.currentPrice, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <TableSortLabel active={sortState.startsWith('currentPrice')} direction={sortState.endsWith('_desc') ? 'desc' : 'asc'} onClick={() => handleSort('currentPrice')}>
                  Цена
                </TableSortLabel>
                <ResizeHandle colIndex={7} />
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, width: cw.discountPercent, minWidth: cw.discountPercent, position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <TableSortLabel active={sortState.startsWith('discountPercent')} direction={sortState.endsWith('_desc') ? 'desc' : 'asc'} onClick={() => handleSort('discountPercent')}>
                  Скидка %
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {offers.map((offer, idx) => (
              <TableRow key={`${offer.id}-${idx}`} hover sx={{ bgcolor: offer.confidence === 'low' ? '#fff8e1' : undefined }}>
                <EllipsisCell text={offer.sellerName} width={cw.seller} />
                <TableCell sx={{ py: 0.5, maxWidth: cw.wine, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={offer.wineName || offer.wineNameRaw || undefined}>
                  <Link href={offer.url} target="_blank" rel="noopener noreferrer" underline="hover" sx={{ fontSize: '0.875rem', color: 'text.primary', '&:hover': { color: 'primary.main' } }}>
                    {offer.wineName || offer.wineNameRaw}
                  </Link>
                  {offer.fullName && offer.fullName !== (offer.wineName || offer.wineNameRaw) && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {offer.fullName}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ py: 0.5 }}>{offer.vintage || '—'}</TableCell>
                <EllipsisCell text={offer.country} width={cw.country} />
                <TableCell sx={{ py: 0.5 }}>{offer.wineType ? <WineTypeChip type={offer.wineType} /> : '—'}</TableCell>
                <TableCell sx={{ py: 0.5 }}>{offer.volumeMl ? `${(offer.volumeMl / 1000).toString().replace('.', ',')}л` : '—'}</TableCell>
                <TableCell sx={{ py: 0.5, textAlign: 'right' }}>
                  {offer.oldPrice ? (
                    <Typography variant="body2" sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                      {Math.round(offer.oldPrice).toLocaleString('ru-RU')}
                    </Typography>
                  ) : '—'}
                </TableCell>
                <TableCell sx={{ py: 0.5, textAlign: 'right' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {Math.round(offer.currentPrice).toLocaleString('ru-RU')}
                  </Typography>
                </TableCell>
                <TableCell sx={{ py: 0.5, textAlign: 'right' }}>
                  {offer.discountPercent ? (
                    <Chip label={`-${offer.discountPercent}%`} size="small" sx={{ bgcolor: offer.discountPercent < 30 ? '#e8f5e9' : offer.discountPercent < 45 ? '#fff9c4' : '#ffebee', color: offer.discountPercent < 30 ? '#2e7d32' : offer.discountPercent < 45 ? '#f57f17' : '#c62828', fontWeight: 700 }} />
                  ) : '—'}
                </TableCell>
              </TableRow>
            ))}
            {offers.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
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
