import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Zap, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'
import api from '@/lib/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarPass, setMostrarPass] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [errores, setErrores] = useState<{ email?: string; password?: string }>({})

  const { setAuth } = useAuthStore()
  const { mostrar } = useToast()
  const navigate = useNavigate()

  const validar = () => {
    const nuevosErrores: typeof errores = {}
    if (!email) nuevosErrores.email = 'El email es requerido'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nuevosErrores.email = 'Email inválido'
    if (!password) nuevosErrores.password = 'La contraseña es requerida'
    setErrores(nuevosErrores)
    return Object.keys(nuevosErrores).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validar()) return

    setCargando(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setAuth(data.usuario, data.accessToken, data.refreshToken)
      mostrar('success', '¡Bienvenido!', `Hola, ${data.usuario.nombre}`)
      navigate('/')
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Error al iniciar sesión'
      mostrar('error', 'Error de acceso', msg)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl gradient-brand mb-4 shadow-xl shadow-primary/30">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-brand-text">Email Builder</h1>
          <p className="text-muted-foreground mt-2 text-sm">Plataforma de Email Marketing</p>
        </div>

        {/* Formulario */}
        <div className="card-surface">
          <h2 className="text-xl font-semibold mb-1">Iniciar sesión</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Ingresa tus credenciales de administrador
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Correo electrónico"
              type="email"
              placeholder="admin@tudominio.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              error={errores.email}
              leftIcon={<Mail className="h-4 w-4" />}
              autoComplete="email"
              autoFocus
            />

            <div className="relative">
              <Input
                label="Contraseña"
                type={mostrarPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                error={errores.password}
                leftIcon={<Lock className="h-4 w-4" />}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setMostrarPass(!mostrarPass)}
                className="absolute right-3 top-8 text-muted-foreground hover:text-foreground transition-colors"
              >
                {mostrarPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Button type="submit" className="w-full mt-2" loading={cargando} size="lg">
              Iniciar sesión
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Las credenciales se configuran en el archivo{' '}
            <code className="bg-secondary px-1 py-0.5 rounded text-primary">.env</code>
          </p>
        </div>
      </div>
    </div>
  )
}
