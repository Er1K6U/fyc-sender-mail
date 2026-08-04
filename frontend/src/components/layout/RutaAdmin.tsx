import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

/**
 * Restringe una rama de rutas a administradores.
 * Se anida dentro de RutaProtegida, que ya garantiza la autenticación.
 * El backend valida el rol igualmente: esto solo evita mostrar la vista.
 */
export default function RutaAdmin() {
  const usuario = useAuthStore(s => s.usuario)
  return usuario?.rol === 'admin' ? <Outlet /> : <Navigate to="/" replace />
}
