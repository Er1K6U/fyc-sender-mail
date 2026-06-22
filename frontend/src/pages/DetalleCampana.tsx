import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Play, Pause, XCircle, CheckCircle2,
  Clock, Send, Zap, BarChart2,
  RefreshCw, Eye, MousePointerClick,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { useCampaignSocket } from '@/hooks/useSocket'
import { cn, formatearFecha, formatearNumero } from '@/lib/utils'
import api from '@/lib/api'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Campana {
  id: number; nombre: string; asunto: string; from_nombre: string; from_email: string
  estado: string; total_envios: number; enviados: number; fallidos: number
  abiertos: number; clicks: number; programada_para?: string; completada_en?: string
  emails_por_min: number; lista_nombre?: string; smtp_nombre?: string
  created_at: string
}

interface SendRow {
  id: number; email: string; nombre?: string; estado: string
  enviado_en?: string; ultimo_error?: string; intentos: number
}

interface Progreso {
  total: number; enviados: number; fallidos: number; pendientes: number
  velocidad: number; eta_segundos: number | null
  abiertos: number; clicks: number
}

const ESTADO_BADGE: Record<string, { variant: any; label: string }> = {
  pendiente:  { variant: 'secondary',   label: 'Pendiente' },
  enviando:   { variant: 'info',        label: 'Enviando' },
  enviado:    { variant: 'success',     label: 'Enviado' },
  fallido:    { variant: 'destructive', label: 'Fallido' },
  rebotado:   { variant: 'warning',     label: 'Rebotado' },
}

const ESTADO_CAMPANA: Record<string, { label: string; variant: any; color: string }> = {
  borrador:   { label: 'Borrador',   variant: 'secondary',   color: 'text-muted-foreground' },
  programada: { label: 'Programada', variant: 'warning',     color: 'text-yellow-400' },
  enviando:   { label: 'Enviando',   variant: 'info',        color: 'text-blue-400' },
  pausada:    { label: 'Pausada',    variant: 'orange',      color: 'text-orange-400' },
  completada: { label: 'Completada', variant: 'success',     color: 'text-green-400' },
  error:      { label: 'Error',      variant: 'destructive', color: 'text-red-400' },
}

function formatEta(seg: number | null) {
  if (seg === null || seg <= 0) return '—'
  if (seg < 60) return `${seg}s`
  if (seg < 3600) return `${Math.ceil(seg / 60)}min`
  return `${Math.floor(seg / 3600)}h ${Math.ceil((seg % 3600) / 60)}min`
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function DetalleCampana() {
  const { id } = useParams<{ id: string }>()
  const campaignId = Number(id)
  const navigate = useNavigate()
  const { mostrar } = useToast()

  const [campana, setCampana] = useState<Campana | null>(null)
  const [progreso, setProgreso] = useState<Progreso>({
    total: 0, enviados: 0, fallidos: 0, pendientes: 0,
    velocidad: 0, eta_segundos: null, abiertos: 0, clicks: 0,
  })
  const [sends, setSends] = useState<SendRow[]>([])
  const [logs, setLogs] = useState<{ nivel: string; mensaje: string; ts: number }[]>([])
  const [cargando, setCargando] = useState(true)
  const [pagina, setPagina] = useState(1)
  const [totalSends, setTotalSends] = useState(0)
  const logsRef = useRef<HTMLDivElement>(null)

  // Cargar estado inicial
  const cargar = async () => {
    try {
      const [rCampana, rProgreso, rSends] = await Promise.all([
        api.get(`/campanas/${campaignId}`),
        api.get(`/campanas/${campaignId}/progreso`),
        api.get(`/campanas/${campaignId}/sends?pagina=1&por_pagina=50`),
      ])
      setCampana(rCampana.data.campana)
      const p = rProgreso.data
      setProgreso({
        total: p.total || 0,
        enviados: p.enviados || 0,
        fallidos: p.fallidos || 0,
        pendientes: p.pendientes || 0,
        velocidad: p.velocidad || 0,
        eta_segundos: p.eta_segundos ?? null,
        abiertos: rCampana.data.campana.abiertos || 0,
        clicks: rCampana.data.campana.clicks || 0,
      })
      setSends(rSends.data.sends ?? [])
      setTotalSends(rSends.data.total ?? 0)
    } catch {
      mostrar('error', 'Error al cargar la campaña')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [campaignId])

  // Socket.io en tiempo real
  useCampaignSocket(campana ? campaignId : null, {
    'campaign:progress': (data: any) => {
      setProgreso(prev => ({ ...prev, ...data }))
    },
    'campaign:send_update': (data: any) => {
      setSends(prev => {
        const idx = prev.findIndex(s => s.id === data.sendId)
        if (idx === -1) return prev
        const updated = [...prev]
        updated[idx] = {
          ...updated[idx],
          estado: data.estado,
          enviado_en: data.enviado_en,
          ultimo_error: data.error,
        }
        return updated
      })
    },
    'campaign:completed': (data: any) => {
      setCampana(prev => prev ? { ...prev, estado: 'completada', completada_en: data.completada_en } : null)
      mostrar('success', '¡Campaña completada!')
    },
    'campaign:paused': () => {
      setCampana(prev => prev ? { ...prev, estado: 'pausada' } : null)
    },
    'campaign:error': (msg: string) => {
      setCampana(prev => prev ? { ...prev, estado: 'error' } : null)
      mostrar('error', `Error en campaña: ${msg}`)
    },
    'campaign:log': (data: any) => {
      setLogs(prev => [
        { nivel: data.nivel, mensaje: data.mensaje, ts: Date.now() },
        ...prev.slice(0, 99), // max 100 logs
      ])
    },
  })

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = 0
  }, [logs])

  const accion = async (endpoint: string, mensaje: string) => {
    try {
      await api.post(`/campanas/${campaignId}/${endpoint}`)
      mostrar('success', mensaje)
      cargar()
    } catch (err: any) {
      mostrar('error', err.response?.data?.error || 'Error')
    }
  }

  const cargarMasSends = async () => {
    const sig = pagina + 1
    const { data } = await api.get(`/campanas/${campaignId}/sends?pagina=${sig}&por_pagina=50`)
    setSends(prev => [...prev, ...data.sends])
    setPagina(sig)
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!campana) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        <p>Campaña no encontrada</p>
        <Button className="mt-4" onClick={() => navigate('/campanas')}>Volver</Button>
      </div>
    )
  }

  const cfg = ESTADO_CAMPANA[campana.estado] || ESTADO_CAMPANA.borrador
  const porcentaje = progreso.total > 0
    ? Math.min(100, Math.round(((progreso.enviados + progreso.fallidos) / progreso.total) * 100))
    : 0
  const tasaApertura = progreso.enviados > 0
    ? ((progreso.abiertos / progreso.enviados) * 100).toFixed(1)
    : '0'
  const tasaClick = progreso.enviados > 0
    ? ((progreso.clicks / progreso.enviados) * 100).toFixed(1)
    : '0'
  const enviando = campana.estado === 'enviando'

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate('/campanas')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{campana.nombre}</h1>
            <Badge variant={cfg.variant as any}>
              {enviando && <RefreshCw className="h-3 w-3 animate-spin" />}
              {cfg.label}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1 truncate">{campana.asunto}</p>
        </div>
        {/* Acciones */}
        <div className="flex gap-2 shrink-0">
          {(campana.estado === 'completada' || campana.enviados > 0) && (
            <Button variant="outline" onClick={() => navigate(`/reportes/campana/${campana.id}`)}>
              <BarChart2 className="h-4 w-4" /> Ver reporte
            </Button>
          )}
          {campana.estado === 'borrador' && (
            <Button onClick={() => accion('iniciar', '¡Campaña iniciada!')}>
              <Play className="h-4 w-4" /> Iniciar envío
            </Button>
          )}
          {campana.estado === 'enviando' && (
            <Button variant="outline" onClick={() => accion('pausar', 'Campaña pausada')}>
              <Pause className="h-4 w-4" /> Pausar
            </Button>
          )}
          {campana.estado === 'pausada' && (
            <>
              <Button onClick={() => accion('reanudar', 'Reanudando...')}>
                <Play className="h-4 w-4" /> Reanudar
              </Button>
              <Button variant="destructive" onClick={() => accion('cancelar', 'Campaña cancelada')}>
                <XCircle className="h-4 w-4" /> Cancelar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Barra de progreso grande */}
      {progreso.total > 0 && (
        <Card>
          <CardContent className="pt-5 pb-4 space-y-3">
            <div className="flex justify-between items-end">
              <div>
                <span className="text-3xl font-bold">{porcentaje}%</span>
                <span className="text-muted-foreground text-sm ml-2">completado</span>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <span className="text-foreground font-medium">{formatearNumero(progreso.enviados + progreso.fallidos)}</span>
                {' '}de {formatearNumero(progreso.total)} enviados
              </div>
            </div>
            <div className="h-4 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-1000',
                  campana.estado === 'completada' ? 'bg-green-500' :
                  progreso.fallidos > 0 ? 'bg-gradient-to-r from-primary to-red-500' :
                  'gradient-brand'
                )}
                style={{ width: `${porcentaje}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-4 pt-1">
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">{formatearNumero(progreso.enviados)}</p>
                <p className="text-xs text-muted-foreground">Enviados</p>
              </div>
              <div className="text-center">
                <p className={cn('text-lg font-bold', enviando ? 'text-primary animate-pulse' : 'text-muted-foreground')}>
                  {formatearNumero(progreso.pendientes)}
                </p>
                <p className="text-xs text-muted-foreground">Pendientes</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-400">{formatearNumero(progreso.fallidos)}</p>
                <p className="text-xs text-muted-foreground">Fallidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Métricas en tiempo real */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Velocidad', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10',
            valor: `${progreso.velocidad}/min`,
            sub: enviando ? 'En tiempo real' : '—',
          },
          {
            label: 'Tiempo restante', icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10',
            valor: formatEta(progreso.eta_segundos),
            sub: enviando ? 'Estimado' : campana.completada_en ? `Terminó ${formatearFecha(campana.completada_en)}` : '—',
          },
          {
            label: 'Tasa de apertura', icon: Eye, color: 'text-violet-400', bg: 'bg-violet-500/10',
            valor: `${tasaApertura}%`,
            sub: `${formatearNumero(progreso.abiertos)} abiertos`,
          },
          {
            label: 'Tasa de clicks', icon: MousePointerClick, color: 'text-primary', bg: 'bg-primary/10',
            valor: `${tasaClick}%`,
            sub: `${formatearNumero(progreso.clicks)} clicks`,
          },
        ].map(({ label, icon: Icon, color, bg, valor, sub }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={cn('h-5 w-5', color)} />
              </div>
              <div>
                <p className="text-xl font-bold">{valor}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground">{sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabla de envíos + Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tabla de envíos */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Envíos</h2>
            <span className="text-xs text-muted-foreground">{formatearNumero(totalSends)} en total</span>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Email</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground">Estado</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground">Enviado</th>
                  </tr>
                </thead>
                <tbody>
                  {sends.map(s => {
                    const badge = ESTADO_BADGE[s.estado] || ESTADO_BADGE.pendiente
                    return (
                      <tr key={s.id} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                        <td className="py-2 px-4">
                          <div className="font-medium truncate max-w-[200px]">{s.email}</div>
                          {s.ultimo_error && (
                            <div className="text-[11px] text-red-400 truncate max-w-[200px]" title={s.ultimo_error}>
                              {s.ultimo_error}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <Badge variant={badge.variant as any} className="text-[11px]">
                            {badge.label}
                          </Badge>
                          {s.intentos > 1 && (
                            <span className="text-[10px] text-muted-foreground ml-1">×{s.intentos}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
                          {s.enviado_en ? formatearFecha(s.enviado_en) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {sends.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-muted-foreground text-sm">
                        {campana.estado === 'borrador' ? 'Inicia la campaña para ver los envíos' : 'Sin envíos registrados aún'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {sends.length < totalSends && (
              <div className="p-3 border-t border-border text-center">
                <Button variant="ghost" size="sm" onClick={cargarMasSends}>
                  Cargar más ({totalSends - sends.length} restantes)
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Log en tiempo real */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Log en tiempo real</h2>
            <span className="text-xs text-muted-foreground">{logs.length} entradas</span>
          </div>
          <Card>
            <div
              ref={logsRef}
              className="h-[400px] overflow-y-auto p-3 space-y-1 font-mono text-[11px]"
            >
              {logs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {enviando ? 'Esperando eventos...' : 'Sin logs. Inicia la campaña para ver actividad.'}
                </p>
              ) : logs.map((log, i) => (
                <div key={i} className={cn(
                  'flex gap-2 leading-relaxed',
                  log.nivel === 'error' ? 'text-red-400' :
                  log.nivel === 'warn' ? 'text-yellow-400' :
                  'text-muted-foreground'
                )}>
                  <span className="shrink-0 text-[10px] opacity-50">
                    {new Date(log.ts).toLocaleTimeString('es-ES')}
                  </span>
                  <span>{log.mensaje}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Info de la campaña */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Configuración de la campaña</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Remitente</p>
              <p className="font-medium">{campana.from_nombre}</p>
              <p className="text-xs text-muted-foreground">{campana.from_email}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Lista</p>
              <p className="font-medium">{campana.lista_nombre || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Throttling</p>
              <p className="font-medium">{campana.emails_por_min} emails/min</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Creada</p>
              <p className="font-medium">{formatearFecha(campana.created_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
