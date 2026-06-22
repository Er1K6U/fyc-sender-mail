import { useState, useEffect } from 'react'
import { Save, AlertCircle, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import api from '@/lib/api'

interface Props {
  open: boolean
  onClose: () => void
  plantillaId?: number | null
  nombreInicial?: string
  descripcionInicial?: string
  onGuardada: (id: number, nombre: string) => void
  obtenerDatosEditor: () => Promise<{ html: string; design: object }>
  asunto: string
  editorListo: boolean
}

export default function ModalGuardarPlantilla({
  open, onClose, plantillaId, nombreInicial, descripcionInicial,
  onGuardada, obtenerDatosEditor, asunto, editorListo,
}: Props) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const { mostrar } = useToast()

  useEffect(() => {
    if (open) {
      setNombre(nombreInicial || 'Nueva plantilla')
      setDescripcion(descripcionInicial || '')
      setError('')
    }
  }, [open, nombreInicial, descripcionInicial])

  const handleGuardar = async () => {
    if (!nombre.trim()) {
      setError('El nombre es requerido')
      return
    }
    setGuardando(true)
    setError('')
    try {
      if (!editorListo) {
        throw new Error('El editor aún se está cargando. Espera un momento e inténtalo de nuevo.')
      }

      const { html, design } = await obtenerDatosEditor()

      if (!html || html.trim().length < 50) {
        throw new Error('El contenido del email está vacío. Agrega al menos un bloque de contenido.')
      }

      // thumbnail_url NO se incluye: Unlayer la genera como Base64 (demasiado larga para URL)
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        asunto,
        html_content: html,
        json_design: design,
      }

      let id: number
      if (plantillaId) {
        await api.put(`/plantillas/${plantillaId}`, payload)
        id = plantillaId
        mostrar('success', '✅ Plantilla actualizada', nombre)
      } else {
        const { data } = await api.post('/plantillas', payload)
        id = data.plantilla.id
        mostrar('success', '✅ Plantilla guardada', nombre)
      }

      onGuardada(id, nombre.trim())
      onClose()
    } catch (err: any) {
      // Mostrar el error exacto: del backend o local
      const mensajeError =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Error desconocido al guardar la plantilla'
      setError(mensajeError)
      mostrar('error', 'No se pudo guardar', mensajeError)
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
              <Save className="h-4 w-4 text-white" />
            </div>
            <div>
              <DialogTitle>
                {plantillaId ? 'Actualizar plantilla' : 'Guardar como plantilla'}
              </DialogTitle>
              <DialogDescription>
                {plantillaId
                  ? 'Los cambios se guardarán en esta plantilla'
                  : 'Guarda este diseño para reutilizarlo en futuras campañas'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {!editorListo && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span>El editor aún se está cargando, espera un momento...</span>
            </div>
          )}
          <Input
            label="Nombre de la plantilla"
            placeholder="Ej: Newsletter Octubre, Promoción Black Friday..."
            value={nombre}
            onChange={e => { setNombre(e.target.value); setError('') }}
            autoFocus
          />
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Input
            label="Descripción (opcional)"
            placeholder="Describe brevemente para qué sirve esta plantilla"
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
          />
          {asunto && (
            <div className="p-3 bg-secondary/50 rounded-lg">
              <p className="text-xs text-muted-foreground">
                Asunto guardado:{' '}
                <span className="text-foreground font-medium">{asunto}</span>
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGuardar} loading={guardando} disabled={!editorListo || guardando}>
            <Save className="h-4 w-4" />
            {plantillaId ? 'Actualizar' : 'Guardar plantilla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
