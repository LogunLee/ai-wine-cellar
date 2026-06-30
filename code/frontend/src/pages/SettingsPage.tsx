import { useState } from 'react'
import { Box, Container, Tab, Tabs, Typography } from '@mui/material'
import ProfilePage from './ProfilePage'
import AiSettingsTab from '../features/ai-settings/AiSettingsTab'

const SettingsPage = () => {
  const [tab, setTab] = useState(0)

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
        Настройки
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Профиль" />
        <Tab label="AI-модели" />
      </Tabs>
      <Box hidden={tab !== 0}>{tab === 0 && <ProfilePage />}</Box>
      <Box hidden={tab !== 1}>{tab === 1 && <AiSettingsTab />}</Box>
    </Container>
  )
}

export default SettingsPage
