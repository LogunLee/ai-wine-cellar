import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material'
import { Email, Lock, Visibility, VisibilityOff } from '@mui/icons-material'
import GoogleColoredIcon from './GoogleColoredIcon'
import { env } from '../config/env'

/** Общие куски экранов Login/Register: шапка с лого, Google-кнопка, поля, снэкбар ошибки. */

const mutedIcon = { color: 'rgba(0, 0, 0, 0.26)' }

export const AuthLogoHeader = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 4 }}>
    <Box sx={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
      <img src="/logo.png" alt="Merlotic" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </Box>
    <Typography variant="h3" sx={{ fontWeight: 700 }}>
      Merlotic
    </Typography>
  </Box>
)

export const GoogleAuthButton = ({ label }: { label: string }) => (
  <Button
    variant="outlined"
    fullWidth
    size="large"
    startIcon={<GoogleColoredIcon />}
    onClick={() => {
      window.location.href = `${env.API_URL}/auth/google`
    }}
    sx={{ mb: 3 }}
  >
    {label}
  </Button>
)

interface FieldProps {
  value: string
  onChange: (value: string) => void
}

export const EmailField = ({ value, onChange }: FieldProps) => (
  <TextField
    fullWidth
    label="Email"
    type="email"
    autoComplete="email"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    required
    slotProps={{
      input: {
        startAdornment: (
          <InputAdornment position="start">
            <Email sx={mutedIcon} />
          </InputAdornment>
        ),
      },
    }}
    sx={{ mb: 2 }}
  />
)

export const PasswordField = ({ value, onChange }: FieldProps) => {
  const [show, setShow] = useState(false)
  return (
    <TextField
      fullWidth
      label="Пароль"
      type={show ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Lock sx={mutedIcon} />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={() => setShow(!show)} edge="end">
                {show ? <VisibilityOff sx={mutedIcon} /> : <Visibility sx={mutedIcon} />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
      sx={{ mb: 3 }}
    />
  )
}

export const AuthErrorSnackbar = ({ error, onClose }: { error: string | null; onClose: () => void }) => (
  <Snackbar open={!!error} autoHideDuration={6000} onClose={onClose}>
    <Alert severity="error" onClose={onClose}>
      {error}
    </Alert>
  </Snackbar>
)
