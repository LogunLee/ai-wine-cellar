import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  IconButton,
  Checkbox,
  Chip,
  CircularProgress,
  Alert,
  Paper,
  Autocomplete,
} from '@mui/material'
import {
  Close,
  Edit,
  Search,
  Image as ImageIcon,
  ArrowBack,
  Add,
  Remove,
  Check,
  Cancel,
} from '@mui/icons-material'
import { wineSearchApi, wineCellarApi, countriesApi, type WineRecognitionResult, type Country } from '../../shared/api/wineSearch'
import WineResearchModal from './WineResearchModal'

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

interface WineSearchModalProps {
  open: boolean
  onClose: () => void
}

interface EditableWine extends WineRecognitionResult {
  _id: string
  _selected: boolean
  _editing: boolean
  _bottleCount: number
  _draft?: { producer: string; name: string; vintageYear?: number; region?: string; country?: string }
}

const WineSearchModal = ({ open, onClose }: WineSearchModalProps) => {
  const [searchText, setSearchText] = useState('')
  const [hiddenText, setHiddenText] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<EditableWine[]>([])
  const [searched, setSearched] = useState(false)
  const [researchWine, setResearchWine] = useState<{ producer: string; name: string; vintageYear?: number; region?: string } | null>(null)
  const [researchOpen, setResearchOpen] = useState(false)
  const [addingToCellar, setAddingToCellar] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)
  const [countries, setCountries] = useState<Country[]>([])
  const [fetchingPhotoId, setFetchingPhotoId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    countriesApi.list()
      .then(({ data }) => setCountries(data))
      .catch(console.error)
  }, [])

  const compressImage = (blob: Blob): Promise<string> => {
    const maxSize = 350 * 1024
    const maxWidth = 1600
    const maxHeight = 1600

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        URL.revokeObjectURL(img.src)
        let w = img.width
        let h = img.height

        if (w > maxWidth || h > maxHeight) {
          const ratio = Math.min(maxWidth / w, maxHeight / h)
          w = Math.round(w * ratio)
          h = Math.round(h * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas context failed')); return }
        ctx.drawImage(img, 0, 0, w, h)

        const tryCompress = (quality: number) => {
          canvas.toBlob(
            (compressedBlob) => {
              if (!compressedBlob) { reject(new Error('Compression failed')); return }
              if (compressedBlob.size <= maxSize || quality <= 0.1) {
                const reader = new FileReader()
                reader.onerror = reject
                reader.onload = () => {
                  const base64 = (reader.result as string).split(',')[1]
                  resolve(base64)
                }
                reader.readAsDataURL(compressedBlob)
              } else {
                tryCompress(quality - 0.1)
              }
            },
            'image/jpeg',
            quality,
          )
        }
        tryCompress(0.85)
      }
      img.src = URL.createObjectURL(blob)
    })
  }

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) return

        try {
          const base64 = await compressImage(blob)
          setImages((prev) => [...prev, base64])
          if (searchText) {
            setHiddenText(searchText)
            setSearchText('')
          }
        } catch (err) {
          console.error('Image compression error:', err)
        }
        break
      }
    }
  }, [searchText])

  useEffect(() => {
    if (open) {
      document.addEventListener('paste', handlePaste)
    }
    return () => {
      document.removeEventListener('paste', handlePaste)
    }
  }, [open, handlePaste])

  useEffect(() => {
    if (!open) {
      setSearchText('')
      setHiddenText('')
      setImages([])
      setResults([])
      setSearched(false)
      setError(null)
      setAddSuccess(false)
      setAddingToCellar(false)
    }
  }, [open])

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleFind = async () => {
    if (images.length === 0 && !searchText.trim()) return
    setLoading(true)
    setError(null)
    setSearched(true)

    try {
      let wines
      if (images.length > 0) {
        const { data } = await wineSearchApi.recognize(images)
        wines = data.wines
      } else {
        const { data } = await wineSearchApi.textSearch(searchText.trim())
        wines = data.wines
      }
      setResults(
        wines.map((w, i) => ({
          ...w,
          _id: `wine-${i}`,
          _selected: true,
          _editing: false,
          _bottleCount: 1,
          _draft: { producer: w.producer, name: w.name, vintageYear: w.vintageYear, region: w.region, country: w.country },
        })),
      )
    } catch (err: any) {
      console.error('[WineSearch] Error:', err)
      console.error('[WineSearch] Response:', err.response?.data)
      setError(err.response?.data?.message || 'Ошибка распознавания')
      setSearched(false)
    } finally {
      setLoading(false)
    }
  }

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isTextField = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT'
    if (e.key === 'Enter' && !e.shiftKey && !searched && (images.length > 0 || searchText.trim()) && !loading && !isTextField) {
      e.preventDefault()
      handleFind()
    }
  }

  const handleBackToSearch = () => {
    setSearched(false)
    setResults([])
    setError(null)
  }

  const toggleSelect = (id: string) => {
    setResults((prev) =>
      prev.map((w) => (w._id === id ? { ...w, _selected: !w._selected } : w)),
    )
  }

  const startEdit = (id: string) => {
    setResults((prev) =>
      prev.map((w) => {
        if (w._id !== id) return w
        return {
          ...w,
          _editing: true,
          _draft: {
            producer: w.producer,
            name: w.name,
            vintageYear: w.vintageYear,
            region: w.region,
            country: w.country,
          },
        }
      }),
    )
  }

  const cancelEdit = (id: string) => {
    setResults((prev) =>
      prev.map((w) => (w._id === id ? { ...w, _editing: false, _draft: undefined } : w)),
    )
  }

  const confirmEdit = (id: string) => {
    setResults((prev) =>
      prev.map((w) => {
        if (w._id !== id || !w._draft) return w
        return {
          ...w,
          producer: w._draft.producer,
          name: w._draft.name,
          vintageYear: w._draft.vintageYear,
          region: w._draft.region,
          country: w._draft.country,
          _editing: false,
          _draft: undefined,
        }
      }),
    )
  }

  const updateDraft = (id: string, field: keyof NonNullable<EditableWine['_draft']>, value: unknown) => {
    setResults((prev) =>
      prev.map((w) =>
        w._id === id && w._draft ? { ...w, _draft: { ...w._draft, [field]: value } } : w,
      ),
    )
  }

  const incrementBottles = (id: string) => {
    setResults((prev) =>
      prev.map((w) => (w._id === id ? { ...w, _bottleCount: w._bottleCount + 1 } : w)),
    )
  }

  const decrementBottles = (id: string) => {
    setResults((prev) =>
      prev.map((w) =>
        w._id === id && w._bottleCount > 1 ? { ...w, _bottleCount: w._bottleCount - 1 } : w,
      ),
    )
  }

  const totalBottleCount = results.filter((w) => w._selected).reduce((sum, w) => sum + w._bottleCount, 0)

  const handleAddToCellar = async () => {
    const selected = results.filter((w) => w._selected)
    if (selected.length === 0) return

    setAddingToCellar(true)
    try {
      await Promise.all(
        selected.map((w) =>
          wineCellarApi.add({
            producer: w.producer,
            name: w.name,
            vintageYear: w.vintageYear,
            region: w.region,
            country: w.country,
            wineType: w.wineType,
            quantity: w._bottleCount,
          }),
        ),
      )
      setAddSuccess(true)
      window.dispatchEvent(new CustomEvent('cellar-updated'))
      setTimeout(() => {
        setAddSuccess(false)
        onClose()
      }, 1500)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка добавления в погреб')
    } finally {
      setAddingToCellar(false)
    }
  }

  const handleCancelSelection = () => {
    setResults((prev) => prev.map((w) => ({ ...w, _selected: false })))
  }

  const handleFetchPhoto = async (wine: EditableWine) => {
    setFetchingPhotoId(wine._id)
    try {
      await wineCellarApi.fetchPhoto(wine._id, {
        producer: wine.producer,
        name: wine.name,
        vintageYear: wine.vintageYear,
      })
    } catch (err) {
      console.error('Failed to fetch photo:', err)
    } finally {
      setFetchingPhotoId(null)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      onKeyDown={handleDialogKeyDown}
      sx={{
        '& .MuiDialog-paper': {
          width: { xs: '95vw', sm: '90vw', md: '80vw', lg: '70vw' },
          maxWidth: 1200,
          height: '80vh',
          maxHeight: 700,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {searched && (
            <IconButton size="small" onClick={handleBackToSearch}>
              <ArrowBack />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{searched ? 'Найденные вина' : 'Найти вино'}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ flex: 1, overflow: 'auto' }}>
        {!searched && (
          <>
            {images.length > 0 && (
              <>
                <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {images.map((img, idx) => (
                    <Paper
                      key={idx}
                      variant="outlined"
                      sx={{
                        position: 'relative',
                        width: 200,
                        height: 200,
                        overflow: 'hidden',
                        borderRadius: 2,
                      }}
                    >
                      <img
                        src={`data:image/jpeg;base64,${img}`}
                        alt={`Wine ${idx + 1}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => removeImage(idx)}
                        sx={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          bgcolor: 'rgba(0,0,0,0.6)',
                          color: '#fff',
                          p: 0.5,
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
                        }}
                      >
                        <Close fontSize="small" />
                      </IconButton>
                      {images.length > 1 && (
                        <Box
                          sx={{
                            position: 'absolute',
                            bottom: 4,
                            left: 4,
                            bgcolor: 'rgba(0,0,0,0.6)',
                            color: '#fff',
                            borderRadius: 1,
                            px: 0.5,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                          }}
                        >
                          {idx + 1}/{images.length}
                        </Box>
                      )}
                    </Paper>
                  ))}
                </Box>
              </>
            )}

            {images.length === 0 && (
              <>
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  maxRows={6}
                  placeholder="Опишите вино, вставьте изображение (Ctrl+V) или введите название"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  inputRef={textareaRef}
                  sx={{ mb: 2 }}
                />
              </>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
          </>
        )}

        {searched && results.length > 0 && (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {results.map((wine) => (
              <Paper
                key={wine._id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  mb: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  minHeight: 85,
                }}
              >
                {!wine._editing && (
                  <Checkbox
                    checked={wine._selected}
                    onChange={() => toggleSelect(wine._id)}
                    size="small"
                    sx={{ flexShrink: 0 }}
                  />
                )}

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {wine._editing && wine._draft ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <TextField
                        size="small"
                        label="Производитель"
                        value={wine._draft.producer}
                        onChange={(e) => updateDraft(wine._id, 'producer', e.target.value)}
                        sx={{ flex: 1, minWidth: 140 }}
                      />
                      <TextField
                        size="small"
                        label="Название"
                        value={wine._draft.name}
                        onChange={(e) => updateDraft(wine._id, 'name', e.target.value)}
                        sx={{ flex: 1, minWidth: 140 }}
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="Год"
                        value={wine._draft.vintageYear || ''}
                        onChange={(e) =>
                          updateDraft(
                            wine._id,
                            'vintageYear',
                            e.target.value ? Number(e.target.value) : undefined,
                          )
                        }
                        sx={{ width: 90 }}
                      />
                      <TextField
                        size="small"
                        label="Регион"
                        value={wine._draft.region || ''}
                        onChange={(e) => updateDraft(wine._id, 'region', e.target.value)}
                        sx={{ width: 130 }}
                      />
                      <Autocomplete
                        size="small"
                        options={countries}
                        getOptionLabel={(opt) => opt.name}
                        value={(() => {
                          const draftCountry = wine._draft?.country
                          if (!draftCountry) return null
                          const byIso2 = countries.find((c) => c.iso2 === draftCountry)
                          if (byIso2) return byIso2
                          const byName = countries.find((c) => c.name.toLowerCase() === draftCountry.toLowerCase())
                          if (byName) return byName
                          return null
                        })()}
                        onChange={(_, val) => updateDraft(wine._id, 'country', val?.iso2 || undefined)}
                        renderInput={(params) => (
                          <TextField {...params} label="Страна" sx={{ width: 150 }} />
                        )}
                        disableClearable
                      />
                    </Box>
                  ) : (
                    <>
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: 600, lineHeight: 1.2 }}
                        noWrap
                      >
                        {wine.producer} {wine.name}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                        {wine.vintageYear && (
                          <Chip label={wine.vintageYear} size="small" variant="outlined" />
                        )}
                        {wine.region && (
                          <Chip label={wine.region} size="small" variant="outlined" />
                        )}
                        {wine.country && (
                          <Chip label={wine.country} size="small" variant="outlined" />
                        )}
                        {wine.wineType && (
                          <WineTypeChip type={wine.wineType} />
                        )}
                        <Chip
                          label={`${Math.round(wine.confidence * 100)}%`}
                          size="small"
                          color={
                            wine.confidence > 0.8
                              ? 'success'
                              : wine.confidence > 0.5
                                ? 'warning'
                                : 'error'
                          }
                        />
                      </Box>
                    </>
                  )}
                </Box>

                {wine._editing && wine._draft ? (
                  <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                    <IconButton
                      size="small"
                      onClick={() => confirmEdit(wine._id)}
                      title="Применить"
                      color="success"
                    >
                      <Check fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => cancelEdit(wine._id)}
                      title="Отмена"
                      color="error"
                    >
                      <Cancel fontSize="small" />
                    </IconButton>
                  </Box>
                ) : (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        mr: 1,
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={() => decrementBottles(wine._id)}
                        disabled={wine._bottleCount <= 1}
                        sx={{ p: 0.5 }}
                      >
                        <Remove fontSize="small" />
                      </IconButton>
                      <Typography
                        sx={{
                          px: 1,
                          minWidth: 24,
                          textAlign: 'center',
                          fontWeight: 600,
                          fontSize: '0.875rem',
                        }}
                      >
                        {wine._bottleCount}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => incrementBottles(wine._id)}
                        sx={{ p: 0.5 }}
                      >
                        <Add fontSize="small" />
                      </IconButton>
                    </Box>

                    <IconButton
                      size="small"
                      onClick={() => startEdit(wine._id)}
                      title="Редактировать"
                    >
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => {
                        setResearchWine({
                          producer: wine.producer,
                          name: wine.name,
                          vintageYear: wine.vintageYear,
                          region: wine.region,
                        })
                        setResearchOpen(true)
                      }}
                      title="Поиск информации"
                    >
                      <Search fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleFetchPhoto(wine)}
                      disabled={fetchingPhotoId === wine._id}
                      title="Найти фото"
                    >
                      {fetchingPhotoId === wine._id ? <CircularProgress size={16} /> : <ImageIcon fontSize="small" />}
                    </IconButton>
                  </Box>
                )}
              </Paper>
            ))}
          </>
        )}

        {searched && results.length === 0 && !loading && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Вина не распознаны. Попробуйте другое изображение.
          </Alert>
        )}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
      </DialogContent>

      {!searched && (
        <DialogActions sx={{ px: 3, pb: 2, flexShrink: 0, height: 56, alignItems: 'center' }}>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {images.length > 0 && (
              <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                {searchText ? 'Текст будет проигнорирован, т.к. есть фото' : 'Ctrl+V чтобы добавить ещё фото'}
              </Typography>
            )}
          </Box>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : (images.length > 0 ? <ImageIcon /> : <Search />)}
            onClick={handleFind}
            disabled={(images.length === 0 && !searchText.trim()) || loading}
          >
            {loading ? 'Ищу...' : 'Найти'}
          </Button>
        </DialogActions>
      )}

      {searched && (
        <DialogActions sx={{ px: 3, pb: 2, flexShrink: 0, height: 56, alignItems: 'center' }}>
          {results.some((w) => w._editing) ? (
            <Typography sx={{ flex: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
              Редактирование
            </Typography>
          ) : addSuccess ? (
            <Typography sx={{ flex: 1, color: 'success.main', fontSize: '0.875rem', fontWeight: 600 }}>
              Добавлено в погреб!
            </Typography>
          ) : totalBottleCount > 0 ? (
            <>
              <Button onClick={handleCancelSelection}>Отмена</Button>
              <Button
                variant="contained"
                onClick={handleAddToCellar}
                startIcon={addingToCellar ? <CircularProgress size={20} color="inherit" /> : <Add />}
                disabled={addingToCellar}
              >
                {addingToCellar ? 'Добавляю...' : `Добавить в погреб (${totalBottleCount})`}
              </Button>
            </>
          ) : (
            <Typography sx={{ flex: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
              Отметьте вина для добавления в погреб
            </Typography>
          )}
        </DialogActions>
      )}

      <WineResearchModal
        open={researchOpen}
        wine={researchWine}
        onClose={() => setResearchOpen(false)}
      />
    </Dialog>
  )
}

export default WineSearchModal
