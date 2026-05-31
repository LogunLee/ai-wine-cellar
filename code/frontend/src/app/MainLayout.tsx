import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  Avatar,
  Button,
  Tooltip,
} from '@mui/material'
import {
  Menu as MenuIcon,
  WineBar,
  Liquor,
  Logout,
  Person,
  LocalOffer,
  Percent,
  FavoriteBorder,
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material'
import { useAuthStore } from '../entities/auth/store'
import { env } from '../shared/config/env'
import WineSearchModal from '../features/wine-search/WineSearchModal'
import { loadCountries } from '../shared/services/countryCache'

const drawerWidth = 240
const drawerCollapsedWidth = 64

export const MainLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    return saved === 'true'
  })
  const [searchOpen, setSearchOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  useEffect(() => {
    loadCountries().catch(console.error)
  }, [])

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed))
  }, [collapsed])

  const currentWidth = collapsed ? drawerCollapsedWidth : drawerWidth

  const menuItems = [
    { text: 'Погреб', path: '/cellar', icon: <Liquor /> },
    { text: 'Скидки', path: '/discounts', icon: <Percent /> },
    { text: 'Избранное', path: '/favorites', icon: <FavoriteBorder /> },
    { text: 'Профиль', path: '/profile', icon: <Person /> },
  ]

  const avatarUrl = user?.avatarPath ? `${env.API_URL}${user.avatarPath}` : null

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flexShrink: 0 }}>
        <Toolbar disableGutters sx={{ justifyContent: 'flex-start', px: 2, minHeight: '63px !important' }}>
          <Box sx={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden' }}>
            <img src="/logo.jpg" alt="Enolo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Box>
          {!collapsed && (
            <Typography variant="h5" sx={{ fontWeight: 700, ml: 2 }}>
              Enolo
            </Typography>
          )}
        </Toolbar>
        <Divider />
      </Box>
      <List sx={{ border: 'none', outline: 'none', flex: 1 }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <ListItem key={item.text} disablePadding>
              <Tooltip title={collapsed ? item.text : ''} placement="right">
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  sx={{
                    justifyContent: collapsed ? 'center' : 'initial',
                    px: 2.5,
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mr: collapsed ? 0 : 3, fontWeight: isActive ? 700 : 400, justifyContent: 'center' }}>
                    {item.icon}
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={item.text}
                      slotProps={{ primary: { fontWeight: isActive ? 700 : 400 } }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          )
        })}
      </List>
      <Box sx={{ flexShrink: 0, display: { xs: 'none', sm: 'flex' }, justifyContent: 'flex-end', pr: 1, py: 1 }}>
        <Tooltip title={collapsed ? 'Развернуть' : 'Свернуть'} placement="right">
          <IconButton onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: '#fff',
          color: 'text.primary',
          boxShadow: 'none',
          borderRadius: 0,
          left: { sm: currentWidth },
          width: { sm: `calc(100% - ${currentWidth}px)` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Button
            variant="contained"
            startIcon={<WineBar />}
            onClick={() => setSearchOpen(true)}
            sx={{
              bgcolor: '#BE0212',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1rem',
              px: 3,
              py: 1,
              mr: 'auto',
              '&:hover': { bgcolor: '#9a010e' },
              display: { xs: 'none', sm: 'flex' },
            }}
          >
            Найти вино
          </Button>

          <IconButton
            color="inherit"
            onClick={() => setSearchOpen(true)}
            sx={{ display: { sm: 'none' } }}
          >
            <WineBar />
          </IconButton>

          <IconButton color="inherit" onClick={() => navigate('/profile')}>
            <Avatar src={avatarUrl || undefined} sx={{ width: 32, height: 32 }}>
              {user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
            </Avatar>
          </IconButton>
          <IconButton color="inherit" onClick={logout} sx={{ ml: 1 }}>
            <Logout />
          </IconButton>
        </Toolbar>
        <Divider sx={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} />
      </AppBar>

      <Box component="nav" sx={{ width: { sm: currentWidth }, flexShrink: { sm: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', borderRadius: 0, borderRight: 'none' },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { width: currentWidth, boxSizing: 'border-box', borderRadius: 0, borderRight: 'none', overflowX: 'hidden', transition: (theme) => theme.transitions.create('width', { duration: 200 }) },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, bgcolor: '#f5f5f5', minHeight: '100vh' }}>
        <Toolbar />
        <Outlet />
      </Box>

      <WineSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  )
}
