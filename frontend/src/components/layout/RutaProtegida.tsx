import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export default function RutaProtegida() {
  const estaAutenticado = useAuthStore(s => s.estaAutenticado())
  return estaAutenticado ? <Outlet /> : <Navigate to="/login" replace />
}
