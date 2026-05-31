import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Link,
  Divider,
  IconButton,
} from '@mui/material'
import { Close, OpenInNew, Refresh, ArrowBack } from '@mui/icons-material'
import { wineSearchApi, type WineResearchInput, type WineResearchResult } from '../../shared/api/wineSearch'

interface WineResearchModalProps {
  open: boolean
  wine: { producer: string; name: string; vintageYear?: number; region?: string } | null
  onClose: () => void
}

const WineResearchModal = ({ open, wine, onClose }: WineResearchModalProps) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WineResearchResult | null>(null)

  useEffect(() => {
    if (open && wine) {
      runResearch()
    }
    if (!open) {
      setResult(null)
      setError(null)
    }
  }, [open])

  const runResearch = async () => {
    if (!wine) return
    setLoading(true)
    setError(null)

    const input: WineResearchInput = {
      wineName: wine.name,
      vintage: wine.vintageYear?.toString(),
      producerHint: wine.producer,
      countryHint: undefined,
    }

    try {
      const { data } = await wineSearchApi.research(input)
      setResult(data)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка исследования')
    } finally {
      setLoading(false)
    }
  }

  const confidenceColor = (c: string) =>
    c === 'high' ? 'success' : c === 'medium' ? 'warning' : 'error'

  const confidenceLabel = (c: string) =>
    c === 'high' ? 'Высокая' : c === 'medium' ? 'Средняя' : 'Низкая'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
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
          <IconButton onClick={onClose} size="small">
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            {wine ? `${wine.producer} ${wine.name}${wine.vintageYear ? ` ${wine.vintageYear}` : ''}` : 'Исследование вина'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {loading && (
          <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
            <CircularProgress />
            <Typography color="text.secondary">Ищу информацию о вине...</Typography>
          </Box>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {result && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`Уверенность: ${confidenceLabel(result.confidence)}`}
                color={confidenceColor(result.confidence) as any}
                size="small"
              />
              {result.missingFields.length > 0 && (
                <Chip
                  label={`Не найдено: ${result.missingFields.join(', ')}`}
                  variant="outlined"
                  size="small"
                  color="warning"
                />
              )}
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Информация о вине
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                {result.wine.fullName && (
                  <InfoField label="Полное название" value={result.wine.fullName} />
                )}
                {result.wine.producer && (
                  <InfoField label="Производитель" value={result.wine.producer} />
                )}
                {result.wine.country && <InfoField label="Страна" value={result.wine.country} />}
                {result.wine.region && <InfoField label="Регион" value={result.wine.region} />}
                {result.wine.appellation && (
                  <InfoField label="Аппелласьон" value={result.wine.appellation} />
                )}
                {result.wine.vintage && <InfoField label="Винтаж" value={result.wine.vintage} />}
                {result.wine.wineType && <InfoField label="Тип" value={result.wine.wineType} />}
                {result.wine.grapes && result.wine.grapes.length > 0 && (
                  <InfoField label="Сорта" value={result.wine.grapes.join(', ')} />
                )}
                {result.wine.alcohol && <InfoField label="Алкоголь" value={result.wine.alcohol} />}
                {result.wine.acidity && <InfoField label="Кислотность" value={result.wine.acidity} />}
                {result.wine.sugar && <InfoField label="Сахар" value={result.wine.sugar} />}
                {result.wine.aging && <InfoField label="Выдержка" value={result.wine.aging} />}
                {result.wine.style && <InfoField label="Стиль" value={result.wine.style} />}
                {result.wine.tastingProfile && (
                  <InfoField label="Профиль" value={result.wine.tastingProfile} />
                )}
                {result.wine.storagePotential && (
                  <InfoField label="Потенциал хранения" value={result.wine.storagePotential} />
                )}
                {result.wine.servingTemperature && (
                  <InfoField label="Температура подачи" value={result.wine.servingTemperature} />
                )}
                {result.wine.foodPairing && result.wine.foodPairing.length > 0 && (
                  <InfoField label="Гастропары" value={result.wine.foodPairing.join(', ')} />
                )}
              </Box>
            </Box>

            {result.sources.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Источники
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {result.sources.map((src, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 0.5,
                        borderRadius: 1,
                        bgcolor: src.used ? 'action.selected' : 'transparent',
                      }}
                    >
                      <Chip
                        label={src.trustLevel === 'high' ? 'Высокий' : src.trustLevel === 'medium' ? 'Средний' : 'Низкий'}
                        size="small"
                        color={src.trustLevel === 'high' ? 'success' : src.trustLevel === 'medium' ? 'warning' : 'default'}
                        sx={{ fontSize: '0.7rem', minHeight: 20 }}
                      />
                      <Link href={src.url} target="_blank" rel="noopener" sx={{ fontSize: '0.85rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {src.title || src.url}
                      </Link>
                      <OpenInNew fontSize="small" sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {result.notes.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Примечания
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  {result.notes.map((note, idx) => (
                    <Typography key={idx} component="li" variant="body2" color="text.secondary">
                      {note}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, flexShrink: 0, height: 56, alignItems: 'center' }}>
        {result && (
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={runResearch}
            disabled={loading}
          >
            Повторить
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

const InfoField = ({ label, value }: { label: string; value: string }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 500 }}>
      {value}
    </Typography>
  </Box>
)

export default WineResearchModal
