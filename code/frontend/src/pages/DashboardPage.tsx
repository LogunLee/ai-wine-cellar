import { Box, Container, Grid, Paper, Typography } from '@mui/material'
import { WineBar, EmojiEvents, History } from '@mui/icons-material'

const DashboardPage = () => {
  const stats = [
    { label: 'Бутылок в погребе', value: 0, icon: <WineBar /> },
    { label: 'Дегустаций', value: 0, icon: <EmojiEvents /> },
    { label: 'Последняя активность', value: '—', icon: <History /> },
  ]

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" sx={{ mb: 4, fontWeight: 700 }}>
        Дашборд
      </Typography>

      <Grid container spacing={3}>
        {stats.map((stat) => (
          <Grid item xs={12} sm={4} key={stat.label}>
            <Paper
              elevation={1}
              sx={{
                p: 3,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: 'primary.main',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {stat.icon}
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {stat.label}
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {stat.value}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Container>
  )
}

export default DashboardPage
