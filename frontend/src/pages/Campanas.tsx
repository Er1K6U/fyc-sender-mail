import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, Plus, Play, Pause, XCircle, BarChart2,
  Clock, CheckCircle2, FileText,
  ChevronRight, Trash2, Eye, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatearFecha, formatearNumero, formatearPorcentaje, cn } from '@/lib/utils'
import api from '@/lib/api'

interface Campana {
  id: number
  nombre: string
  asunto: string
  from_nombre: string
  from_email: string
  estado: string
  total_envios: number
  enviados: number
  fallidos: number
  abiertos: number
  clicks: number
  programada_para?: string
  iniciada_en?: string
  completada_en?: string
  created_at: string
  lista_nombre?: string
  smtp_nombre?: string
}

const ESTADO_CONFIG: Record<string, { label: string; variant: any; icon: React.ReactNode; color: string }> = {
  borrador:   { label: 'Borrador',    variant: 'secondary',    icon: <FileText className="h-3 w-3" />,     color: 'text-muted-foreground' },
  programada: { label: 'Programada',  variant: 'warning',      icon: <Clock className="h-3 w-3" />,        color: 'text-yellow-400' },
  enviando:   { label: 'Enviando...',  variant: 'info',        icon: <Send className="h-3 w-3 animate-pulse" />, color: 'text-blue-400' },
  pausada:    { label: 'Pausada',     variant: 'orange',       icon: <Pause className="h-3 w-3" />,        color: 'text-orange-400' },
  completada: { label: 'Completada',  variant: 'success',      icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-green-400' },
  error:      { label: 'Error',       variant: 'destructive',  icon: <XCircle className="h-3 w-3" />,      color: 'text-red-400' },
}

export default function Campanas() {
  const [campanas, setCampanas] = useState<Campana[]>([])
  const [cargando, setCargando] = useState(true)
  const navigate = useNavigate()
  const { mostrar } = useToast()

  const cargar = async () => {
    try {
      const { data } = await api.get('/campanas')
      setCampanas(data.campanas)
    } catch {
      mostrar('error', 'Error al cargar campañas')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  // Refresco automático cada 10s si hay campañas en envío
  useEffect(() => {
    const hayEnviando = campanas.some(c => c.estado === 'enviando')
    if (!hayEnviando) return
    const t = setInterval(cargar, 10_000)
    return () => clearInterval(t)
  }, [campanas])

  const accion = async (id: number, endpoint: string, mensaje: string) => {
    try {
      await api.post(`/campanas/${id}/${endpoint}`)
      mostrar('success', mensaje)
      cargar()
    } catch (err: any) {
      mostrar('error', err.response?.data?.error || 'Error en la acción')
    }
  }

  const handleEliminar = async (id: number, nombre: string) => {
    if (!confirm(`¿Eliminar la campaña "${nombre}"?`)) return
    try {
      await api.delete(`/campanas/${id}`)
      mostrar('success', 'Campaña eliminada')
      setCampanas(prev => prev.filter(c => c.id !== id))
    } catch (err: any) {
      mostrar('error', err.response?.data?.error || 'No se pudo eliminar')
    }
  }

  // Stats globales
  const stats = {
    total: campanas.length,
    enviando: campanas.filter(c => c.estado === 'enviando').length,
    completadas: campanas.filter(c => c.estado === 'completada').length,
    totalEnviados: campanas.reduce((sum, c) => sum + c.enviados, 0),
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campañas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona y envía tus campañas de email marketing
          </p>
        </div>
        <Button onClick={() => navigate('/campanas/nueva')}>
          <Plus className="h-4 w-4" />
          Nueva campaña
        </Button>
      </div>

      {/* Tarjetas globales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total campañas', valor: stats.total, icon: Send, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'En envío ahora', valor: stats.enviando, icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/10', animar: stats.enviando > 0 },
          { label: 'Completadas', valor: stats.completadas, icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'Emails enviados', valor: stats.totalEnviados, icon: BarChart2, color: 'text-violet-400', bg: 'bg-violet-500/10' },
        ].map(({ label, valor, icon: Icon, color, bg, animar }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4 py-4">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={cn('h-5 w-5', color, animar && 'animate-spin')} />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatearNumero(valor)}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista de campañas */}
      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : campanas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
              <Send className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold">Sin campañas aún</h3>
            <p className="text-muted-foreground text-sm mt-2 max-w-sm">
              Crea tu primera campaña seleccionando una lista de contactos y una plantilla de email
            </p>
            <Button className="mt-6" onClick={() => navigate('/campanas/nueva')}>
              <Plus className="h-4 w-4" /> Crear primera campaña
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campanas.map(campana => {
            const cfg = ESTADO_CONFIG[campana.estado] || ESTADO_CONFIG.borrador
            const progreso = campana.total_envios > 0
              ? Math.round(((campana.enviados + campana.fallidos) / campana.total_envios) * 100)
              : 0
            const tasaApertura = campana.enviados > 0
              ? Math.round((campana.abiertos / campana.enviados) * 100)
              : 0

            return (
              <Card
                key={campana.id}
                className="hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => navigate(`/campanas/${campana.id}`)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start gap-4">
                    {/* Indicador de estado */}
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                      campana.estado === 'completada' ? 'bg-green-500/15' :
                      campana.estado === 'enviando' ? 'bg-blue-500/15' :
                      campana.estado === 'error' ? 'bg-red-500/15' :
                      'bg-secondary'
                    )}>
                      <div className={cfg.color}>{cfg.icon}</div>
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{campana.nombre}</h3>
                        <Badge variant={cfg.variant as any}>
                          {cfg.icon} {cfg.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">
                        {campana.asunto}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        {campana.lista_nombre && (
                          <span>Lista: <span className="text-foreground">{campana.lista_nombre}</span></span>
                        )}
                        {campana.programada_para && campana.estado === 'programada' && (
                          <span className="text-yellow-400">
                            Programa: {formatearFecha(campana.programada_para)}
                          </span>
                        )}
                        {campana.completada_en && (
                          <span>Completada: {formatearFecha(campana.completada_en)}</span>
                        )}
                        {campana.created_at && !campana.iniciada_en && (
                          <span>Creada: {formatearFecha(campana.created_at)}</span>
                        )}
                      </div>

                      {/* Barra de progreso */}
                      {campana.total_envios > 0 && (
                        <div className="mt-2.5">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>
                              {formatearNumero(campana.enviados + campana.fallidos)} / {formatearNumero(campana.total_envios)}
                              {' '}({progreso}%)
                            </span>
                            {campana.estado === 'completada' && tasaApertura > 0 && (
                              <span className="text-green-400">
                                📧 {tasaApertura}% apertura · 🖱 {campana.clicks} clicks
                              </span>
                            )}
                          </div>
                          <div className="h-1.5 bg-secondary rounded-full">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all duration-500',
                                campana.estado === 'completada' ? 'bg-green-500' :
                                campana.fallidos > 0 ? 'bg-gradient-to-r from-primary to-red-500' :
                                'gradient-brand'
                              )}
                              style={{ width: `${progreso}%` }}
                            />
                          </div>
                          {campana.fallidos > 0 && (
                            <p className="text-[11px] text-red-400 mt-0.5">
                              {formatearNumero(campana.fallidos)} fallidos
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      {campana.estado === 'borrador' && (
                        <Button
                          size="sm"
                          onClick={() => accion(campana.id, 'iniciar', '¡Campaña iniciada!')}
                        >
                          <Play className="h-3.5 w-3.5" /> Enviar
                        </Button>
                      )}
                      {campana.estado === 'enviando' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => accion(campana.id, 'pausar', 'Campaña pausada')}
                        >
                          <Pause className="h-3.5 w-3.5" /> Pausar
                        </Button>
                      )}
                      {campana.estado === 'pausada' && (
                        <Button
                          size="sm"
                          onClick={() => accion(campana.id, 'reanudar', 'Campaña reanudada')}
                        >
                          <Play className="h-3.5 w-3.5" /> Reanudar
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => navigate(`/campanas/${campana.id}`)}
                        title="Ver detalle"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {!['enviando'].includes(campana.estado) && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleEliminar(campana.id, campana.nombre)}
                          className="text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
