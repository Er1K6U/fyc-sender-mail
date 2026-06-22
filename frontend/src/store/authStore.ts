import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Usuario {
  id: number
  nombre: string
  email: string
  rol: string
}

interface AuthState {
  usuario: Usuario | null
  accessToken: string | null
  refreshToken: string | null
  setAuth: (usuario: Usuario, accessToken: string, refreshToken: string) => void
  cerrarSesion: () => void
  estaAutenticado: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      usuario: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (usuario, accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        set({ usuario, accessToken, refreshToken })
      },

      cerrarSesion: () => {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        set({ usuario: null, accessToken: null, refreshToken: null })
      },

      estaAutenticado: () => !!get().accessToken && !!get().usuario,
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        usuario: state.usuario,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
)
