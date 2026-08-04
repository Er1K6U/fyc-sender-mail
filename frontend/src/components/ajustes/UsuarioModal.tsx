import { useState, useEffect } from 'react'
import { UserPlus, KeyRound, Server, Star, ShieldCheck } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import type { Usuario } from '@/types/usuario'

interface Props {
  open: boolean
  onClose: () => void
  usuario?: Usuario | null
  onGuardado: () => void
}

interface CuentaSmtp {
  id: number
  nombre: string
  from_email: string
  activo: number
}

export default function UsuarioModal({ open, onClose, usuario, onGuardado }: Props) {
  const editando = !!usuario?.id
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'editor' as string })
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const { mostrar } = useToast()

  // Asignación de cuentas SMTP
  const [cuentas, setCuentas] = useState<CuentaSmtp[]>([])
  const [asignadas, setAsignadas] = useState<number[]>([])
  const [principal, setPrincipal] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return

    setForm({
      nombre: usuario?.nombre || '',
      email: usuario?.email || '',
      password: '',
      rol: usuario?.rol || 'editor',
    })
    setErrores({})
    setAsignadas([])
    setPrincipal(null)

    const cargar = async () => {
      // El admin ve todas las cuentas, así que este listado sirve de catálogo.
      const { data } = await api.get('/smtp')
      setCuentas(data.smtp_configs ?? [])

      if (usuario?.id) {
        const { data: asig } = await api.get(`/usuarios/${usuario.id}/smtp`)
        setAsignadas((asig.asignaciones ?? []).map((a: any) => a.smtp_config_id))
        const p = (asig.asignaciones ?? []).find((a: any) => a.es_principal)
        setPrincipal(p ? p.smtp_config_id : null)
      }
    }
    cargar().catch(() => mostrar('error', 'Error al cargar las cuentas SMTP'))
  }, [open, usuario])

  const toggleCuenta = (id: number) => {
    setAsignadas(prev => {
      const yaEsta = prev.includes(id)
      const siguiente = yaEsta ? prev.filter(x => x !== id) : [...prev, id]
      // Si se quita la que era principal, se deja sin principal.
      if (yaEsta && principal === id) setPrincipal(null)
      // La primera que se marca pasa a ser principal por comodidad.
      if (!yaEsta && siguiente.length === 1) setPrincipal(id)
      return siguiente
    })
  }

  const guardarAsignaciones = async (userId: number) => {
    await api.put(`/usuarios/${userId}/smtp`, {
      smtp_config_ids: asignadas,
      principal_id: principal,
    })
  }

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
        await guardarAsignaciones(usuario!.id)
        mostrar('success', 'Usuario actualizado')
      } else {
        const { data } = await api.post('/usuarios', {
          nombre: form.nombre,
          email: form.email,
          password: form.password,
          rol: form.rol,
        })
        // El usuario no existe hasta este momento: las asignaciones se guardan
        // justo después, con el id que devuelve la creación.
        if (data?.usuario?.id) await guardarAsignaciones(data.usuario.id)
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

          {/* ── Asignación de cuentas SMTP ── */}
          <div className="border-t border-border/50 pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Cuentas SMTP disponibles</span>
            </div>

            {form.rol === 'admin' ? (
              <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>
                  Los administradores acceden a <strong>todas</strong> las cuentas por su rol.
                  Lo que marques aquí solo define cuál viene preseleccionada al crear campañas.
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Este usuario solo podrá enviar campañas con las cuentas que marques.
                Si no marcas ninguna, no podrá crear campañas.
              </p>
            )}

            {cuentas.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                No hay cuentas SMTP configuradas todavía.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {cuentas.map(c => {
                  const marcada = asignadas.includes(c.id)
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border p-2.5 transition-colors',
                        marcada ? 'border-primary/30 bg-primary/5' : 'border-border/50'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={marcada}
                        onChange={() => toggleCuenta(c.id)}
                        className="w-4 h-4 accent-primary shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {c.nombre}
                          {!c.activo && (
                            <span className="ml-2 text-[10px] text-orange-400">(inactiva)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{c.from_email}</p>
                      </div>
                      {marcada && (
                        <button
                          type="button"
                          onClick={() => setPrincipal(c.id)}
                          title={principal === c.id ? 'Es la principal' : 'Marcar como principal'}
                          className={cn(
                            'p-1.5 rounded-md transition-colors shrink-0',
                            principal === c.id
                              ? 'text-yellow-400'
                              : 'text-muted-foreground hover:text-yellow-400'
                          )}
                        >
                          <Star
                            className="h-4 w-4"
                            fill={principal === c.id ? 'currentColor' : 'none'}
                          />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {asignadas.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                La cuenta marcada con <Star className="h-3 w-3 inline text-yellow-400" fill="currentColor" />{' '}
                viene preseleccionada al crear campañas.
              </p>
            )}
          </div>
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
