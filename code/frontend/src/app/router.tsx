import { createBrowserRouter, Navigate } from 'react-router-dom'
import { MainLayout } from './MainLayout'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import AuthCallbackPage from '../pages/AuthCallbackPage'
import CellarPage from '../pages/CellarPage'
import DiscountsPage from '../pages/DiscountsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/cellar" replace />,
      },
      {
        path: 'dashboard',
        element: <Navigate to="/cellar" replace />,
      },
      {
        path: 'cellar',
        element: <CellarPage />,
      },
      {
        path: 'discounts',
        element: <DiscountsPage />,
      },
    ],
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallbackPage />,
  },
])
