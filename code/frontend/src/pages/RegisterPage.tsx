import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Box, Button, Container, Divider, TextField, Typography, Paper, InputAdornment } from '@mui/material'
import { Person } from '@mui/icons-material'
import { AuthLogoHeader, GoogleAuthButton, EmailField, PasswordField, AuthErrorSnackbar } from '../shared/ui/AuthKit'
import { useAuthStore } from '../entities/auth/store'

const RegisterPage = () => {
  const navigate = useNavigate()
  const { register, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await register(email, password, displayName || undefined)
      navigate('/cellar')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Не удалось зарегистрироваться')
    }
  }

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
          }}
        >
          <AuthLogoHeader />
          <GoogleAuthButton label="Зарегистрироваться через Google" />

          <Divider sx={{ mb: 3 }}>или</Divider>

          <Box component="form" onSubmit={handleSubmit}>
            <EmailField value={email} onChange={setEmail} />
            <TextField
              fullWidth
              label="Имя"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Person sx={{ color: 'rgba(0, 0, 0, 0.26)' }} />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ mb: 2 }}
            />
            <PasswordField value={password} onChange={setPassword} />
            <Button type="submit" variant="contained" fullWidth size="large" sx={{ mb: 2 }} disabled={isLoading}>
              {isLoading ? 'Регистрация...' : 'Зарегистрироваться'}
            </Button>
          </Box>

          <Typography variant="body2" align="center" sx={{ mt: 2 }}>
            Уже есть аккаунт?{' '}
            <Link to="/login" style={{ color: '#BE0212', textDecoration: 'none', fontWeight: 500 }}>
              Войти
            </Link>
          </Typography>
        </Paper>
      </Box>

      <AuthErrorSnackbar error={error} onClose={() => setError(null)} />
    </Container>
  )
}

export default RegisterPage
