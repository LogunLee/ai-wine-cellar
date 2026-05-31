import { useState, useRef } from 'react'
import {
  Box,
  Container,
  Paper,
  Typography,
  Avatar,
  Button,
  IconButton,
  Snackbar,
  Alert,
} from '@mui/material'
import { PhotoCamera, Delete } from '@mui/icons-material'
import { useAuthStore } from '../entities/auth/store'
import { env } from '../shared/config/env'

const ProfilePage = () => {
  const { user, checkAuth } = useAuthStore()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const avatarUrl = user?.avatarPath
    ? `${env.API_URL}${user.avatarPath}`
    : null

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.match(/^image\/(jpeg|png|gif|webp)$/)) {
      setError('Разрешены только изображения (JPEG, PNG, GIF, WebP)')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Файл не должен превышать 5 МБ')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('avatar', file)

      const response = await fetch(`${env.API_URL}/user/avatar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Ошибка загрузки аватара')
      }

      setSuccess('Аватар обновлён')
      await checkAuth()
    } catch {
      setError('Не удалось загрузить аватар')
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveAvatar = async () => {
    setUploading(true)
    try {
      await fetch(`${env.API_URL}/user/avatar`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
      })
      setSuccess('Аватар удалён')
      await checkAuth()
    } catch {
      setError('Не удалось удалить аватар')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper elevation={1} sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ mb: 4, fontWeight: 600 }}>
          Профиль
        </Typography>

        <Box sx={{ position: 'relative', display: 'inline-block', mb: 3 }}>
          <Avatar
            src={avatarUrl || undefined}
            sx={{ width: 120, height: 120, fontSize: 48, bgcolor: 'primary.main' }}
          >
            {user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
          </Avatar>

          <IconButton
            size="small"
            sx={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              bgcolor: 'background.paper',
              boxShadow: 2,
              '&:hover': { bgcolor: 'background.paper' },
            }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <PhotoCamera fontSize="small" />
          </IconButton>

          {avatarUrl && (
            <IconButton
              size="small"
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                bgcolor: 'background.paper',
                boxShadow: 2,
                color: 'error.main',
                '&:hover': { bgcolor: 'background.paper' },
              }}
              onClick={handleRemoveAvatar}
              disabled={uploading}
            >
              <Delete fontSize="small" />
            </IconButton>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {uploading ? 'Загрузка...' : 'Нажмите на камеру, чтобы изменить аватар'}
        </Typography>

        <Box sx={{ mt: 3, textAlign: 'left' }}>
          <Typography variant="body2" color="text.secondary">
            Email
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {user?.email}
          </Typography>

          {user?.displayName && (
            <>
              <Typography variant="body2" color="text.secondary">
                Имя
              </Typography>
              <Typography variant="body1">{user.displayName}</Typography>
            </>
          )}
        </Box>
      </Paper>

      <Snackbar open={!!error} autoHideDuration={4000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>

      <Snackbar open={!!success} autoHideDuration={3000} onClose={() => setSuccess(null)}>
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      </Snackbar>
    </Container>
  )
}

export default ProfilePage
