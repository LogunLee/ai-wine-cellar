import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Box, Button, Container, Divider, Typography, Paper } from '@mui/material'
import { AuthLogoHeader, GoogleAuthButton, EmailField, PasswordField, AuthErrorSnackbar } from '../shared/ui/AuthKit'
import { useAuthStore } from '../entities/auth/store'
import vineyardBg from '../assets/vineyard-bg.jpg'

const LoginPage = () => {
  const navigate = useNavigate()
  const { login, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

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
          <AuthLogoHeader />
          <GoogleAuthButton label="Войти через Google" />

          <Divider sx={{ mb: 3 }}>или</Divider>

          <Box component="form" onSubmit={handleSubmit}>
            <EmailField value={email} onChange={setEmail} />
            <PasswordField value={password} onChange={setPassword} />
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

      <AuthErrorSnackbar error={error} onClose={() => setError(null)} />
    </Box>
  )
}

export default LoginPage
