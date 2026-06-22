import { useEffect, useState } from 'react'
import {
  FileText, Trash2, Copy, Search, Plus, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatearFecha, cn } from '@/lib/utils'
import api from '@/lib/api'

interface Plantilla {
  id: number
  nombre: string
  descripcion?: string
  asunto: string
  thumbnail_url?: string
  created_at: string
}

interface Props {
  plantillaActivaId?: number | null
  onCargar: (plantilla: Plantilla & { html_content: string; json_design?: any }) => void
  onNueva: () => void
}

export default function PanelPlantillas({ plantillaActivaId, onCargar, onNueva }: Props) {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [cargandoId, setCargandoId] = useState<number | null>(null)
  const { mostrar } = useToast()

  const cargar = async () => {
    try {
      const { data } = await api.get('/plantillas')
      setPlantillas(data.plantillas)
    } catch {
      mostrar('error', 'Error al cargar plantillas')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const handleCargar = async (id: number) => {
    setCargandoId(id)
    try {
      const { data } = await api.get(`/plantillas/${id}`)
      onCargar(data.plantilla)
      mostrar('success', 'Plantilla cargada en el editor')
    } catch {
      mostrar('error', 'Error al cargar la plantilla')
    } finally {
      setCargandoId(null)
    }
  }

  const handleDuplicar = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const { data } = await api.post(`/plantillas/${id}/duplicar`)
      setPlantillas(prev => [data.plantilla, ...prev])
      mostrar('success', 'Plantilla duplicada')
    } catch {
      mostrar('error', 'Error al duplicar')
    }
  }

  const handleEliminar = async (id: number, nombre: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar la plantilla "${nombre}"?`)) return
    try {
      await api.delete(`/plantillas/${id}`)
      setPlantillas(prev => prev.filter(p => p.id !== id))
      mostrar('success', 'Plantilla eliminada')
    } catch {
      mostrar('error', 'Error al eliminar')
    }
  }

  const filtradas = plantillas.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.descripcion || '').toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Plantillas guardadas</h3>
          <Button size="icon-sm" variant="ghost" onClick={onNueva} title="Nuevo diseño en blanco">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar plantillas..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-secondary/50 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cargando ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-xs text-muted-foreground">
              {busqueda ? 'Sin resultados' : 'No hay plantillas guardadas'}
            </p>
            {!busqueda && (
              <p className="text-xs text-muted-foreground/60 mt-1">
                Diseña y guarda tu primera plantilla
              </p>
            )}
          </div>
        ) : (
          filtradas.map(plantilla => (
            <div
              key={plantilla.id}
              className={cn(
                'group relative rounded-xl border cursor-pointer transition-all duration-200',
                'hover:border-primary/40 hover:bg-primary/5',
                plantillaActivaId === plantilla.id
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-border/60 bg-card'
              )}
              onClick={() => handleCargar(plantilla.id)}
            >
              {/* Thumbnail */}
              {plantilla.thumbnail_url ? (
                <div className="w-full h-28 rounded-t-xl overflow-hidden bg-white border-b border-border/30">
                  <img
                    src={plantilla.thumbnail_url}
                    alt={plantilla.nombre}
                    className="w-full h-full object-cover object-top"
                  />
                </div>
              ) : (
                <div className="w-full h-20 rounded-t-xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center border-b border-border/30">
                  <FileText className="h-8 w-8 text-primary/30" />
                </div>
              )}

              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{plantilla.nombre}</p>
                    {plantilla.descripcion && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {plantilla.descripcion}
                      </p>
                    )}
                    {plantilla.asunto && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5 italic">
                        Asunto: {plantilla.asunto}
                      </p>
                    )}
                  </div>
                  {plantillaActivaId === plantilla.id && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0 shrink-0">
                      Activa
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatearFecha(plantilla.created_at)}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => handleDuplicar(plantilla.id, e)}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Duplicar"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      onClick={e => handleEliminar(plantilla.id, plantilla.nombre, e)}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Overlay de carga */}
              {cargandoId === plantilla.id && (
                <div className="absolute inset-0 bg-card/80 rounded-xl flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
