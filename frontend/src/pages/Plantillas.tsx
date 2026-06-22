import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Plus, Trash2, Copy, Edit2, Eye,
  Clock, Search, Mail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  updated_at: string
}

export default function Plantillas() {
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const navigate = useNavigate()
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

  const handleDuplicar = async (id: number) => {
    try {
      const { data } = await api.post(`/plantillas/${id}/duplicar`)
      setPlantillas(prev => [data.plantilla, ...prev])
      mostrar('success', 'Plantilla duplicada')
    } catch {
      mostrar('error', 'Error al duplicar')
    }
  }

  const handleEliminar = async (id: number, nombre: string) => {
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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Plantillas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona tus diseños de email reutilizables
          </p>
        </div>
        <Button onClick={() => navigate('/constructor')}>
          <Plus className="h-4 w-4" />
          Nueva plantilla
        </Button>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar plantillas..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-secondary/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60"
        />
      </div>

      {/* Grid de plantillas */}
      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtradas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <FileText className="h-8 w-8 text-primary/50" />
            </div>
            <h3 className="text-lg font-semibold">
              {busqueda ? 'Sin resultados' : 'Sin plantillas aún'}
            </h3>
            <p className="text-muted-foreground text-sm mt-2 max-w-sm">
              {busqueda
                ? `No hay plantillas que coincidan con "${busqueda}"`
                : 'Crea tu primera plantilla con el constructor visual de emails'}
            </p>
            {!busqueda && (
              <Button className="mt-6" onClick={() => navigate('/constructor')}>
                <Plus className="h-4 w-4" />
                Abrir constructor
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Tarjeta nueva plantilla */}
          <button
            onClick={() => navigate('/constructor')}
            className={cn(
              'rounded-xl border-2 border-dashed border-border/60 p-6',
              'flex flex-col items-center justify-center gap-3 text-center',
              'hover:border-primary/50 hover:bg-primary/5 transition-all duration-200',
              'min-h-[240px] group'
            )}
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Crear desde cero</p>
              <p className="text-xs text-muted-foreground mt-0.5">Editor drag & drop</p>
            </div>
          </button>

          {filtradas.map(plantilla => (
            <div
              key={plantilla.id}
              className="group rounded-xl border border-border/60 bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200"
            >
              {/* Thumbnail */}
              <div className="relative h-36 bg-gradient-to-br from-primary/5 to-accent/5 border-b border-border/30 overflow-hidden">
                {plantilla.thumbnail_url ? (
                  <img
                    src={plantilla.thumbnail_url}
                    alt={plantilla.nombre}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Mail className="h-12 w-12 text-primary/20" />
                  </div>
                )}
                {/* Overlay con acciones */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate(`/constructor?plantilla=${plantilla.id}`)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{plantilla.nombre}</p>
                    {plantilla.descripcion && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {plantilla.descripcion}
                      </p>
                    )}
                    {plantilla.asunto && (
                      <p className="text-xs text-muted-foreground/60 truncate mt-0.5 italic">
                        {plantilla.asunto}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatearFecha(plantilla.updated_at)}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDuplicar(plantilla.id)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Duplicar"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => navigate(`/constructor?plantilla=${plantilla.id}`)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                      title="Editar en constructor"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleEliminar(plantilla.id, plantilla.nombre)}
                      className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
