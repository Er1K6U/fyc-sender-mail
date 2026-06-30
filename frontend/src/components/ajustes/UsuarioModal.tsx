import { useState, useEffect } from 'react'
import { UserPlus, KeyRound } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import api from '@/lib/api'
import type { Usuario } from '@/types/usuario'

interface Props {
  open: boolean
  onClose: () => void
  usuario?: Usuario | null
  onGuardado: () => void
}

export default function UsuarioModal({ open, onClose, usuario, onGuardado }: Props) {
  const editando = !!usuario?.id
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'editor' as string })
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const { mostrar } = useToast()

  useEffect(() => {
    if (open) {
      setForm({
        nombre: usuario?.nombre || '',
        email: usuario?.email || '',
        password: '',
        rol: usuario?.rol || 'editor',
      })
      setErrores({})
    }
  }, [open, usuario])

  const validar = () => {
    const e: Record<string, string> = {}
    if (!form.nombre.trim()) e.nombre = 'El nombre es requerido'
    if (!form.email.trim()) e.email = 'El email es requerido'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email inválido'
    if (!editando && form.password.length < 8) e.password = 'Mínimo 8 caracteres'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const handleGuardar = async () => {
    if (!validar()) return
    setGuardando(true)
    try {
      if (editando) {
        await api.put(`/usuarios/${usuario!.id}`, {
          nombre: form.nombre,
          email: form.email,
          rol: form.rol,
        })
        mostrar('success', 'Usuario actualizado')
      } else {
        await api.post('/usuarios', {
          nombre: form.nombre,
          email: form.email,
          password: form.password,
          rol: form.rol,
        })
        mostrar('success', 'Usuario creado correctamente')
      }
      onGuardado()
      onClose()
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Error al guardar el usuario'
      mostrar('error', 'Error', msg)
      if (msg.toLowerCase().includes('email')) setErrores({ email: msg })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center shadow-lg shadow-primary/30">
              <UserPlus className="h-4 w-4 text-white" />
            </div>
            <div>
              <DialogTitle>{editando ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
              <DialogDescription>
                {editando ? 'Modifica los datos y el rol del usuario' : 'Crea un usuario con acceso a la plataforma'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <Input
            label="Nombre completo"
            placeholder="Juan García"
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            error={errores.nombre}
            autoFocus
          />

          <Input
            label="Correo electrónico"
            type="email"
            placeholder="juan@ejemplo.com"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            error={errores.email}
          />

          {!editando && (
            <Input
              label="Contraseña inicial"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              error={errores.password}
            />
          )}

          <Select value={form.rol} onValueChange={v => setForm({ ...form, rol: v })}>
            <SelectTrigger label="Rol">
              <SelectValue placeholder="Selecciona un rol..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrador (acceso total)</SelectItem>
              <SelectItem value="editor">Usuario normal (acceso limitado)</SelectItem>
            </SelectContent>
          </Select>

          <p className="text-xs text-muted-foreground leading-relaxed">
            El <strong>usuario normal</strong> puede gestionar campañas, contactos y plantillas, pero no puede
            administrar usuarios, la configuración global de envío, las cuentas SMTP ni eliminar campañas.
          </p>

          {editando && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <KeyRound className="h-3.5 w-3.5" />
              Para cambiar la contraseña usa la acción "Restablecer contraseña" en la tabla.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGuardar} loading={guardando}>
            {editando ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
