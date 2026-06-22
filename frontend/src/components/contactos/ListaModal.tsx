import { useState, useEffect } from 'react'
import { Layers } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import api from '@/lib/api'

interface Lista {
  id?: number
  nombre: string
  descripcion?: string
}

interface Props {
  open: boolean
  onClose: () => void
  lista?: Lista | null
  onGuardada: (lista: any) => void
}

export default function ListaModal({ open, onClose, lista, onGuardada }: Props) {
  const editando = !!lista?.id
  const [form, setForm] = useState({ nombre: '', descripcion: '' })
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const { mostrar } = useToast()

  useEffect(() => {
    if (open) {
      setForm({ nombre: lista?.nombre || '', descripcion: lista?.descripcion || '' })
      setErrores({})
    }
  }, [open, lista])

  const handleGuardar = async () => {
    if (!form.nombre.trim()) {
      setErrores({ nombre: 'El nombre es requerido' })
      return
    }
    setGuardando(true)
    try {
      let data
      if (editando) {
        const res = await api.put(`/listas/${lista!.id}`, form)
        data = res.data
        mostrar('success', 'Lista actualizada')
      } else {
        const res = await api.post('/listas', form)
        data = res.data
        mostrar('success', 'Lista creada correctamente')
      }
      onGuardada(data.lista || { ...lista, ...form })
      onClose()
    } catch (err: any) {
      mostrar('error', 'Error', err.response?.data?.error || 'Error al guardar')
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
              <Layers className="h-4 w-4 text-white" />
            </div>
            <DialogTitle>{editando ? 'Editar lista' : 'Nueva lista de contactos'}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <Input
            label="Nombre de la lista"
            placeholder="Ej: Clientes 2024, Newsletter, Leads..."
            value={form.nombre}
            onChange={e => setForm({ ...form, nombre: e.target.value })}
            error={errores.nombre}
            autoFocus
          />
          <Input
            label="Descripción (opcional)"
            placeholder="Descripción de la lista..."
            value={form.descripcion}
            onChange={e => setForm({ ...form, descripcion: e.target.value })}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGuardar} loading={guardando}>
            {editando ? 'Guardar' : 'Crear lista'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
