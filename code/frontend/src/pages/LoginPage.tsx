import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Container,
  Divider,
  TextField,
  Typography,
  Paper,
  InputAdornment,
  IconButton,
  Snackbar,
  Alert,
} from '@mui/material'
import { Email, Lock, Visibility, VisibilityOff } from '@mui/icons-material'
import GoogleColoredIcon from '../shared/ui/GoogleColoredIcon'
import { useAuthStore } from '../entities/auth/store'
import { env } from '../shared/config/env'
import vineyardBg from '../assets/vineyard-bg.png'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = () => {
    window.location.href = `${env.API_URL}/auth/google`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await login(email, password)
      navigate('/cellar')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Неверный email или пароль')
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `url(${vineyardBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.35,
          zIndex: 0,
        }}
      />

      <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            bgcolor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 4 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img src="/logo.png" alt="Merlotic" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </Box>
            <Typography variant="h3" sx={{ fontWeight: 700 }}>
              Merlotic
            </Typography>
          </Box>

          <Button
            variant="outlined"
            fullWidth
            size="large"
            startIcon={<GoogleColoredIcon />}
            onClick={handleGoogleLogin}
            sx={{ mb: 3 }}
          >
            Войти через Google
          </Button>

          <Divider sx={{ mb: 3 }}>или</Divider>

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Email sx={{ color: 'rgba(0, 0, 0, 0.26)' }} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Пароль"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock sx={{ color: 'rgba(0, 0, 0, 0.26)' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff sx={{ color: 'rgba(0, 0, 0, 0.26)' }} /> : <Visibility sx={{ color: 'rgba(0, 0, 0, 0.26)' }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ mb: 3 }}
            />

            <Button type="submit" variant="contained" fullWidth size="large" sx={{ mb: 2 }} disabled={isLoading}>
              {isLoading ? 'Вход...' : 'Войти'}
            </Button>
          </Box>

          <Typography variant="body2" align="center" sx={{ mt: 2 }}>
            Нет аккаунта?{' '}
            <Link to="/register" style={{ color: '#BE0212', textDecoration: 'none', fontWeight: 500 }}>
              Зарегистрироваться
            </Link>
          </Typography>
        </Paper>
      </Container>

      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)}>
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default LoginPage
