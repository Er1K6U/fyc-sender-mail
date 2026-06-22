import { useState, useEffect } from 'react'
import { UserPlus } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import api from '@/lib/api'

interface Lista {
  id: number
  nombre: string
}

interface Contacto {
  id?: number
  nombre: string
  email: string
  empresa: string
  list_id?: number
}

interface Props {
  open: boolean
  onClose: () => void
  listas: Lista[]
  listaSeleccionada?: number
  contacto?: Contacto | null
  onGuardado: () => void
}

export default function ContactoModal({
  open, onClose, listas, listaSeleccionada, contacto, onGuardado
}: Props) {
  const editando = !!contacto?.id
  const [form, setForm] = useState({ nombre: '', email: '', empresa: '', list_id: '' })
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const { mostrar } = useToast()

  useEffect(() => {
    if (open) {
      setForm({
        nombre: contacto?.nombre || '',
        email: contacto?.email || '',
        empresa: contacto?.empresa || '',
        list_id: contacto?.list_id?.toString() || listaSeleccionada?.toString() || '',
      })
      setErrores({})
    }
  }, [open, contacto, listaSeleccionada])

  const validar = () => {
    const e: Record<string, string> = {}
    if (!form.nombre.trim()) e.nombre = 'El nombre es requerido'
    if (!form.email.trim()) e.email = 'El email es requerido'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email inválido'
    if (!editando && !form.list_id) e.list_id = 'Selecciona una lista'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const handleGuardar = async () => {
    if (!validar()) return
    setGuardando(true)
    try {
      if (editando) {
        await api.put(`/contactos/${contacto!.id}`, {
          nombre: form.nombre,
          email: form.email,
          empresa: form.empresa,
        })
        mostrar('success', 'Contacto actualizado')
      } else {
        await api.post('/contactos', {
          list_id: parseInt(form.list_id),
          nombre: form.nombre,
          email: form.email,
          empresa: form.empresa,
        })
        mostrar('success', 'Contacto agregado correctamente')
      }
      onGuardado()
      onClose()
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Error al guardar el contacto'
      mostrar('error', 'Error', msg)
      if (msg.includes('email')) setErrores({ email: msg })
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
              <DialogTitle>{editando ? 'Editar contacto' : 'Agregar contacto'}</DialogTitle>
              <DialogDescription>
                {editando ? 'Modifica los datos del contacto' : 'Agrega un contacto manualmente a la lista'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {!editando && (
            <Select value={form.list_id} onValueChange={v => setForm({ ...form, list_id: v })}>
              <SelectTrigger label="Lista de destino" error={errores.list_id}>
                <SelectValue placeholder="Selecciona una lista..." />
              </SelectTrigger>
              <SelectContent>
                {listas.map(l => (
                  <SelectItem key={l.id} value={l.id.toString()}>{l.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

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
            disabled={editando}
          />

          <Input
            label="Empresa (opcional)"
            placeholder="Nombre de la empresa"
            value={form.empresa}
            onChange={e => setForm({ ...form, empresa: e.target.value })}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGuardar} loading={guardando}>
            {editando ? 'Guardar cambios' : 'Agregar contacto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
