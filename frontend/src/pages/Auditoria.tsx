import { useEffect, useState, useCallback } from 'react'
import {
  ShieldCheck, Download, Calendar, Send, XCircle, Trash2,
  Server, AlertTriangle, Loader2, RotateCcw, CheckCircle2, Search,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { cn, formatearFecha, formatearNumero } from '@/lib/utils'
import api from '@/lib/api'
import type {
  EventoAuditoria, ResumenAuditoria, CuentaSmtpAuditoria,
} from '@/types/auditoria'

// Fecha ISO (YYYY-MM-DD) de hace N días.
function isoHaceDias(dias: number) {
  const d = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

const EVENTOS_FILTRO = [
  { valor: 'todos', label: 'Todos los eventos' },
  { valor: 'campana_creada', label: 'Campaña creada' },
  { valor: 'campana_iniciada', label: 'Campaña iniciada' },
  { valor: 'campana_pausada', label: 'Campaña pausada' },
  { valor: 'campana_reanudada', label: 'Campaña reanudada' },
  { valor: 'campana_completada', label: 'Campaña completada' },
  { valor: 'campana_cancelada', label: 'Campaña cancelada' },
  { valor: 'campana_eliminada', label: 'Campaña eliminada' },
  { valor: 'campana_restaurada', label: 'Campaña restaurada' },
  { valor: 'pausa_limite_smtp', label: 'Pausa por límite SMTP' },
]

// Color del badge según el tipo de evento.
function variantEvento(evento: string): any {
  if (evento === 'campana_eliminada') return 'destructive'
  if (evento === 'campana_completada') return 'success'
  if (evento === 'pausa_limite_smtp' || evento === 'campana_pausada') return 'orange'
  if (evento === 'campana_iniciada' || evento === 'campana_reanudada') return 'info'
  return 'secondary'
}

export default function Auditoria() {
  const { mostrar } = useToast()

  const [desde, setDesde] = useState(isoHaceDias(30))
  const [hasta, setHasta] = useState(isoHaceDias(0))
  const [agrupacion, setAgrupacion] = useState<'dia' | 'mes'>('dia')
  const [filtroEvento, setFiltroEvento] = useState('todos')

  const [resumen, setResumen] = useState<ResumenAuditoria | null>(null)
  const [eventos, setEventos] = useState<EventoAuditoria[]>([])
  const [totalEventos, setTotalEventos] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [cuentas, setCuentas] = useState<CuentaSmtpAuditoria[]>([])
  const [eliminadas, setEliminadas] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  const POR_PAGINA = 50

  const cargar = useCallback(async (paginaEventos = 1) => {
    setCargando(true)
    try {
      const rango = `desde=${desde}&hasta=${hasta}`
      const evt = filtroEvento !== 'todos' ? `&evento=${filtroEvento}` : ''

      const [rResumen, rEventos, rSmtp, rEliminadas] = await Promise.all([
        api.get(`/auditoria/resumen?${rango}&agrupacion=${agrupacion}`),
        api.get(`/auditoria/eventos?${rango}${evt}&pagina=${paginaEventos}&por_pagina=${POR_PAGINA}`),
        api.get(`/auditoria/smtp?${rango}`),
        api.get('/campanas/eliminadas'),
      ])

      setResumen(rResumen.data)
      setEventos(rEventos.data.eventos)
      setTotalEventos(rEventos.data.total)
      setPagina(paginaEventos)
      setCuentas(rSmtp.data.cuentas)
      setEliminadas(rEliminadas.data.campanas)
    } catch (err: any) {
      mostrar('error', 'Error al cargar la auditoría', err.response?.data?.error)
    } finally {
      setCargando(false)
    }
  }, [desde, hasta, agrupacion, filtroEvento])

  useEffect(() => { cargar(1) }, [])

  const exportar = async (tipo: 'eventos' | 'envios') => {
    try {
      const { data } = await api.get(
        `/auditoria/exportar?desde=${desde}&hasta=${hasta}&tipo=${tipo}`,
        { responseType: 'blob' }
      )
      const url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `auditoria_${tipo}_${desde}_a_${hasta}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      mostrar('success', 'CSV descargado')
    } catch {
      mostrar('error', 'Error al exportar el CSV')
    }
  }

  const restaurar = async (id: number, nombre: string) => {
    if (!confirm(`¿Restaurar la campaña "${nombre}"? Volverá a aparecer en el listado normal.`)) return
    try {
      await api.post(`/campanas/${id}/restaurar`)
      mostrar('success', 'Campaña restaurada')
      cargar(pagina)
    } catch (err: any) {
      mostrar('error', 'Error', err.response?.data?.error)
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(totalEventos / POR_PAGINA))
  const maxSerie = Math.max(1, ...(resumen?.serie.map(p => p.enviados) ?? [1]))

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-brand flex items-center justify-center shadow-lg shadow-primary/30">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Auditoría de envíos</h1>
            <p className="text-muted-foreground text-sm">
              Historial completo e inmutable, incluidas las campañas eliminadas.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportar('eventos')}>
            <Download className="h-4 w-4" /> CSV de eventos
          </Button>
          <Button variant="outline" onClick={() => exportar('envios')}>
            <Download className="h-4 w-4" /> CSV de envíos
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-1">
          <div className="w-40">
            <Input
              label="Desde" type="date" value={desde}
              onChange={e => setDesde(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Input
              label="Hasta" type="date" value={hasta}
              onChange={e => setHasta(e.target.value)}
            />
          </div>
          <div className="w-36">
            <Select value={agrupacion} onValueChange={v => setAgrupacion(v as 'dia' | 'mes')}>
              <SelectTrigger label="Agrupar por">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dia">Día</SelectItem>
                <SelectItem value="mes">Mes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-52">
            <Select value={filtroEvento} onValueChange={setFiltroEvento}>
              <SelectTrigger label="Evento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENTOS_FILTRO.map(e => (
                  <SelectItem key={e.valor} value={e.valor}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => cargar(1)} loading={cargando}>
            <Search className="h-4 w-4" /> Aplicar
          </Button>
        </CardContent>
      </Card>

      {cargando && !resumen ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando auditoría...
        </div>
      ) : (
        <>
          {/* Totales acumulados */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Enviados en el periodo', icon: Send, color: 'text-green-400',
                bg: 'bg-green-500/10', valor: resumen?.totales.enviados ?? 0,
              },
              {
                label: 'Fallidos', icon: XCircle, color: 'text-red-400',
                bg: 'bg-red-500/10', valor: resumen?.totales.fallidos ?? 0,
              },
              {
                label: 'Campañas implicadas', icon: Calendar, color: 'text-blue-400',
                bg: 'bg-blue-500/10', valor: resumen?.totales.campanas_implicadas ?? 0,
              },
              {
                label: 'De ellas, eliminadas', icon: Trash2, color: 'text-orange-400',
                bg: 'bg-orange-500/10', valor: resumen?.totales.campanas_eliminadas ?? 0,
              },
            ].map(({ label, icon: Icon, color, bg, valor }) => (
              <Card key={label}>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={cn('h-5 w-5', color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold">{formatearNumero(valor)}</p>
                    <p className="text-xs text-muted-foreground truncate">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Serie por periodo */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">
                Envíos por {agrupacion === 'mes' ? 'mes' : 'día'}
              </h2>
              <span className="text-xs text-muted-foreground">
                {resumen?.serie.length ?? 0} periodos con actividad
              </span>
            </div>
            {(resumen?.serie.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Sin envíos registrados en este rango.
              </p>
            ) : (
              <div className="space-y-1.5">
                {resumen!.serie.map(p => (
                  <div key={p.periodo} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground font-mono">
                      {p.periodo}
                    </span>
                    <div className="flex-1 h-5 bg-secondary rounded-md overflow-hidden">
                      <div
                        className="h-full gradient-brand rounded-md transition-all duration-500"
                        style={{ width: `${(p.enviados / maxSerie) * 100}%` }}
                      />
                    </div>
                    <span className="w-20 text-right font-medium tabular-nums">
                      {formatearNumero(p.enviados)}
                    </span>
                    <span className="w-24 text-right text-xs text-muted-foreground">
                      {p.campanas} camp.
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Cuadre por cuenta SMTP */}
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <Server className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Consumo por cuenta SMTP</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              El conteo real son los correos aceptados por el servidor SMTP, que es lo que
              consume cuota del proveedor.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                    <th className="px-3 py-2 font-medium">Cuenta</th>
                    <th className="px-3 py-2 font-medium text-right">Enviados (periodo)</th>
                    <th className="px-3 py-2 font-medium text-right">Fallidos</th>
                    <th className="px-3 py-2 font-medium text-right">Límite/día</th>
                    <th className="px-3 py-2 font-medium text-right">Hoy: contador</th>
                    <th className="px-3 py-2 font-medium text-right">Hoy: real</th>
                    <th className="px-3 py-2 font-medium text-right">Cuadre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {cuentas.map(c => (
                    <tr key={c.smtp_config_id ?? 'sin-cuenta'} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{c.smtp_nombre}</p>
                        {c.from_email && (
                          <p className="text-xs text-muted-foreground">{c.from_email}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                        {formatearNumero(c.enviados_periodo)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                        {formatearNumero(c.fallidos_periodo)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                        {c.limite_dia ? formatearNumero(c.limite_dia) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatearNumero(c.enviados_hoy_contador)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatearNumero(c.enviados_hoy_real)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {c.descuadre_hoy === 0 ? (
                          <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> OK</Badge>
                        ) : (
                          <Badge variant="warning">
                            <AlertTriangle className="h-3 w-3" />
                            {c.descuadre_hoy > 0 ? '+' : ''}{c.descuadre_hoy}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                  {cuentas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                        Sin actividad de envío en este rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Campañas eliminadas */}
          {eliminadas.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <Trash2 className="h-4 w-4 text-orange-400" />
                <h2 className="font-semibold">Campañas eliminadas</h2>
                <Badge variant="orange">{eliminadas.length}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Ocultas del listado normal. Su historial de envíos se conserva íntegro.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                      <th className="px-3 py-2 font-medium">Campaña</th>
                      <th className="px-3 py-2 font-medium text-right">Enviados</th>
                      <th className="px-3 py-2 font-medium">Eliminada el</th>
                      <th className="px-3 py-2 font-medium">Por</th>
                      <th className="px-3 py-2 font-medium text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {eliminadas.map(c => (
                      <tr key={c.id} className="group hover:bg-secondary/30 transition-colors">
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{c.nombre}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[280px]">{c.asunto}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatearNumero(c.enviados || 0)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {formatearFecha(c.deleted_at)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {c.eliminada_por_nombre || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => restaurar(c.id, c.nombre)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Historial de eventos */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Historial de eventos</h2>
              <span className="text-xs text-muted-foreground">
                {formatearNumero(totalEventos)} registros
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                    <th className="px-3 py-2 font-medium">Fecha y hora</th>
                    <th className="px-3 py-2 font-medium">Evento</th>
                    <th className="px-3 py-2 font-medium">Campaña</th>
                    <th className="px-3 py-2 font-medium">Usuario</th>
                    <th className="px-3 py-2 font-medium">Cuenta SMTP</th>
                    <th className="px-3 py-2 font-medium text-right">Enviados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {eventos.map(e => (
                    <tr key={e.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatearFecha(e.created_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={variantEvento(e.evento)} className="text-[11px]">
                          {e.evento_label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium">
                          {e.campaign_nombre || <span className="italic opacity-50">—</span>}
                        </span>
                        {e.campana_eliminada && (
                          <Badge variant="destructive" className="ml-2 text-[10px]">Eliminada</Badge>
                        )}
                        {e.campana_inexistente && e.campaign_id && (
                          <Badge variant="outline" className="ml-2 text-[10px]">Purgada</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          'text-xs',
                          e.user_id ? '' : 'italic text-muted-foreground'
                        )}>
                          {e.user_nombre || 'Sistema'}
                        </span>
                        {e.user_email && (
                          <p className="text-[11px] text-muted-foreground">{e.user_email}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {e.smtp_nombre || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatearNumero(e.enviados)}
                      </td>
                    </tr>
                  ))}
                  {eventos.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                        Sin eventos registrados en este rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/50">
                <span className="text-xs text-muted-foreground">
                  Página {pagina} de {totalPaginas}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    disabled={pagina <= 1}
                    onClick={() => cargar(pagina - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={pagina >= totalPaginas}
                    onClick={() => cargar(pagina + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
