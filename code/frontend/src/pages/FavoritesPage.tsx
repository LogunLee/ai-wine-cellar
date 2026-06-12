import { Container, Typography } from '@mui/material'

const FavoritesPage = () => {
  return (
    <Container maxWidth={false} sx={{ py: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Typography variant="h5" color="text.secondary">
        Раздел «Избранное» скоро появится
      </Typography>
    </Container>
  )
}

export default FavoritesPage
