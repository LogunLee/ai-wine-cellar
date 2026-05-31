import { Box, CircularProgress, Typography } from '@mui/material'

const AuthCallbackPage = () => (
  <Box
    sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    }}
  >
    <CircularProgress size={48} />
    <Typography variant="body1" color="text.secondary">
      Авторизация...
    </Typography>
  </Box>
)

export default AuthCallbackPage
