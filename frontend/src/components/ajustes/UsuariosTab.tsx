import { useEffect, useState } from 'react'
import {
  Plus, Edit2, Trash2, KeyRound, Shield, User as UserIcon,
  CheckCircle2, Ban, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { formatearFecha } from '@/lib/utils'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Usuario } from '@/types/usuario'
import UsuarioModal from './UsuarioModal'

export default function UsuariosTab() {
  const { usuario: usuarioActual } = useAuthStore()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [accion, setAccion] = useState<number | null>(null)
  const [modal, setModal] = useState<{ open: boolean; usuario?: Usuario | null }>({ open: false })
  const [reset, setReset] = useState<{ open: boolean; usuario?: Usuario; password: string; guardando: boolean }>({
    open: false, password: '', guardando: false,
  })
  const { mostrar } = useToast()

  const cargar = async () => {
    try {
      const { data } = await api.get('/usuarios')
      setUsuarios(data.usuarios)
    } catch {
      mostrar('error', 'Error al cargar usuarios')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const toggleActivo = async (u: Usuario) => {
    setAccion(u.id)
    try {
      await api.patch(`/usuarios/${u.id}/activo`, { activo: !u.activo })
      mostrar('success', u.activo ? 'Usuario desactivado' : 'Usuario activado')
      cargar()
    } catch (err: any) {
      mostrar('error', 'Error', err.response?.data?.error)
    } finally {
      setAccion(null)
    }
  }

  const eliminar = async (u: Usuario) => {
    if (!confirm(`¿Eliminar a "${u.nombre}"? Se borrarán también sus datos asociados (campañas, listas, plantillas, SMTP). Esta acción es irreversible.`)) return
    setAccion(u.id)
    try {
      await api.delete(`/usuarios/${u.id}`)
      mostrar('success', 'Usuario eliminado')
      cargar()
    } catch (err: any) {
      mostrar('error', 'Error', err.response?.data?.error)
    } finally {
      setAccion(null)
    }
  }

  const guardarReset = async () => {
    if (reset.password.length < 8) {
      mostrar('error', 'La contraseña debe tener al menos 8 caracteres')
      return
    }
    setReset(r => ({ ...r, guardando: true }))
    try {
      await api.put(`/usuarios/${reset.usuario!.id}/password`, { password: reset.password })
      mostrar('success', 'Contraseña restablecida', 'El usuario deberá iniciar sesión de nuevo.')
      setReset({ open: false, password: '', guardando: false })
    } catch (err: any) {
      mostrar('error', 'Error', err.response?.data?.error)
      setReset(r => ({ ...r, guardando: false }))
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando usuarios...
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Usuarios de la plataforma</h3>
          <p className="text-sm text-muted-foreground">Gestiona quién puede acceder y con qué rol.</p>
        </div>
        <Button onClick={() => setModal({ open: true, usuario: null })}>
          <Plus className="h-4 w-4" /> Nuevo usuario
        </Button>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Último acceso</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {usuarios.map(u => {
                const esYo = u.id === usuarioActual?.id
                return (
                  <tr key={u.id} className="group hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-medium shrink-0">
                          {u.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-medium">{u.nombre}</span>
                          {esYo && <span className="ml-2 text-[10px] text-primary">(tú)</span>}
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.rol === 'admin' ? (
                        <Badge variant="default"><Shield className="h-3 w-3" /> Administrador</Badge>
                      ) : (
                        <Badge variant="secondary"><UserIcon className="h-3 w-3" /> Usuario normal</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.activo ? (
                        <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Activo</Badge>
                      ) : (
                        <Badge variant="destructive"><Ban className="h-3 w-3" /> Inactivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {u.ultimo_login ? formatearFecha(u.ultimo_login) : 'Nunca'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setModal({ open: true, usuario: u })}
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setReset({ open: true, usuario: u, password: '', guardando: false })}
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                          title="Restablecer contraseña"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => toggleActivo(u)}
                          disabled={esYo || accion === u.id}
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-orange-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={esYo ? 'No puedes desactivarte a ti mismo' : (u.activo ? 'Desactivar' : 'Activar')}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => eliminar(u)}
                          disabled={esYo || accion === u.id}
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={esYo ? 'No puedes eliminarte a ti mismo' : 'Eliminar'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <UsuarioModal
        open={modal.open}
        usuario={modal.usuario}
        onClose={() => setModal({ open: false })}
        onGuardado={cargar}
      />

      {/* Modal de restablecer contraseña */}
      <Dialog open={reset.open} onOpenChange={() => setReset({ open: false, password: '', guardando: false })}>
        <DialogContent size="sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center shadow-lg shadow-primary/30">
                <KeyRound className="h-4 w-4 text-white" />
              </div>
              <div>
                <DialogTitle>Restablecer contraseña</DialogTitle>
                <DialogDescription>
                  Nueva contraseña para {reset.usuario?.nombre}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-6">
            <Input
              label="Nueva contraseña"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={reset.password}
              onChange={e => setReset(r => ({ ...r, password: e.target.value }))}
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-2">
              El usuario será desconectado y deberá iniciar sesión con la nueva contraseña.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReset({ open: false, password: '', guardando: false })}>
              Cancelar
            </Button>
            <Button onClick={guardarReset} loading={reset.guardando}>Restablecer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
