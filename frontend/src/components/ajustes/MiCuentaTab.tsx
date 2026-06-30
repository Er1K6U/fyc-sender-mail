import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserCog, KeyRound, Shield, User as UserIcon } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export default function MiCuentaTab() {
  const { usuario, cerrarSesion } = useAuthStore()
  const navigate = useNavigate()
  const [form, setForm] = useState({ passwordActual: '', passwordNueva: '', passwordConfirm: '' })
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const { mostrar } = useToast()

  const validar = () => {
    const e: Record<string, string> = {}
    if (!form.passwordActual) e.passwordActual = 'Ingresa tu contraseña actual'
    if (form.passwordNueva.length < 8) e.passwordNueva = 'Mínimo 8 caracteres'
    if (form.passwordNueva !== form.passwordConfirm) e.passwordConfirm = 'Las contraseñas no coinciden'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const handleGuardar = async () => {
    if (!validar()) return
    setGuardando(true)
    try {
      await api.put('/auth/cambiar-password', {
        passwordActual: form.passwordActual,
        passwordNueva: form.passwordNueva,
      })
      mostrar('success', 'Contraseña actualizada', 'Vuelve a iniciar sesión con tu nueva contraseña.')
      cerrarSesion()
      navigate('/login')
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Error al cambiar la contraseña'
      mostrar('error', 'Error', msg)
      if (msg.toLowerCase().includes('actual')) setErrores({ passwordActual: msg })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      {/* Datos de la cuenta */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center shadow-lg shadow-primary/30">
              <UserCog className="h-4 w-4 text-white" />
            </div>
            <div>
              <CardTitle>Mi cuenta</CardTitle>
              <CardDescription>Datos de tu sesión actual.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Nombre</span>
            <span className="font-medium">{usuario?.nombre}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{usuario?.email}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Rol</span>
            {usuario?.rol === 'admin' ? (
              <Badge variant="default"><Shield className="h-3 w-3" /> Administrador</Badge>
            ) : (
              <Badge variant="secondary"><UserIcon className="h-3 w-3" /> Usuario normal</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cambio de contraseña */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
              <KeyRound className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle>Cambiar contraseña</CardTitle>
              <CardDescription>Tras el cambio tendrás que iniciar sesión de nuevo.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Contraseña actual"
            type="password"
            value={form.passwordActual}
            onChange={e => setForm({ ...form, passwordActual: e.target.value })}
            error={errores.passwordActual}
          />
          <Input
            label="Nueva contraseña"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={form.passwordNueva}
            onChange={e => setForm({ ...form, passwordNueva: e.target.value })}
            error={errores.passwordNueva}
          />
          <Input
            label="Confirmar nueva contraseña"
            type="password"
            value={form.passwordConfirm}
            onChange={e => setForm({ ...form, passwordConfirm: e.target.value })}
            error={errores.passwordConfirm}
          />
          <div className="flex justify-end pt-2">
            <Button onClick={handleGuardar} loading={guardando}>Cambiar contraseña</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
