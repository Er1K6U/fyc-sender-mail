import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import {
  ChevronLeft, Download, Eye, MousePointerClick, Send,
  CheckCircle2, Users, ExternalLink, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DonutChart } from '@/components/charts/DonutChart'
import { LineChart, LineChartLeyenda } from '@/components/charts/LineChart'
import { useToast } from '@/components/ui/toast'
import { formatearNumero, formatearFecha, cn } from '@/lib/utils'
import api from '@/lib/api'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ReporteSummary {
  campana: {
    id: number; nombre: string; asunto: string; from_nombre: string; from_email: string
    estado: string; lista_nombre: string; smtp_host: string
    total_envios: number; enviados: number; fallidos: number; abiertos: number; clicks: number
    programada_para?: string; iniciada_en?: string; completada_en?: string; created_at: string
  }
  tasas: { apertura: string; click: string; error: string; no_entregado: string }
  estados_sends: { estado: string; total: number }[]
  eventos: { tipo: string; total: number }[]
  top_urls: { url: string; total: number }[]
  timeline: { fecha: string; enviados: number; fallidos: number; rebotados: number; aperturas: number; clicks: number }[]
}

interface PageState<T> { data: T | null; total: number; pagina: number; cargando: boolean }
interface AperturaRow { send_id: number; email: string; nombre?: string; empresa?: string; primera_apertura: string; total_aperturas: number; ip?: string }
interface ClickRow    { send_id: number; email: string; nombre?: string; empresa?: string; primer_click: string; total_clicks: number; urls: string[] }
interface NoEntRow    { send_id: number; email: string; nombre?: string; empresa?: string; estado: string; intentos: number; ultimo_error?: string; enviado_en?: string }

const COLORES_ESTADO: Record<string, string> = {
  enviado:  '#22c55e',
  fallido:  '#ef4444',
  rebotado: '#f59e0b',
  pendiente:'#6b7280',
}

const COLORES_EVENTO: Record<string, string> = {
  apertura: '#8b5cf6',
  click:    '#06b6d4',
  rebote:   '#f59e0b',
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ReporteCampana() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { mostrar } = useToast()

  const [resumen, setResumen] = useState<ReporteSummary | null>(null)
  const [cargandoResumen, setCargandoResumen] = useState(true)
  const [tabActiva, setTabActiva] = useState('resumen')

  const [aperturas, setAperturas] = useState<PageState<AperturaRow[]>>({ data: null, total: 0, pagina: 1, cargando: false })
  const [clicks, setClicks]       = useState<PageState<ClickRow[]>>   ({ data: null, total: 0, pagina: 1, cargando: false })
  const [topUrls, setTopUrls]     = useState<{ url: string; total: number; contactos_unicos: number }[]>([])
  const [noEnt, setNoEnt]         = useState<PageState<NoEntRow[]>>   ({ data: null, total: 0, pagina: 1, cargando: false })
  const [exportando, setExportando] = useState(false)

  // Cargar resumen inicial
  useEffect(() => {
    api.get(`/reportes/campana/${id}`)
      .then(r => setResumen(r.data))
      .catch(() => mostrar('error', 'Error al cargar el reporte'))
      .finally(() => setCargandoResumen(false))
  }, [id])

  // Carga lazy por tab
  const cargarAperturas = useCallback(async (pag = 1) => {
    setAperturas(s => ({ ...s, cargando: true }))
    try {
      const { data } = await api.get(`/reportes/campana/${id}/aperturas?pagina=${pag}&por_pagina=50`)
      setAperturas(s => ({
        data: pag === 1 ? data.aperturas : [...(s.data || []), ...data.aperturas],
        total: data.total, pagina: pag, cargando: false,
      }))
    } catch {
      mostrar('error', 'Error al cargar aperturas')
      setAperturas(s => ({ ...s, cargando: false }))
    }
  }, [id])

  const cargarClicks = useCallback(async (pag = 1) => {
    setClicks(s => ({ ...s, cargando: true }))
    try {
      const { data } = await api.get(`/reportes/campana/${id}/clicks?pagina=${pag}&por_pagina=50`)
      setClicks(s => ({
        data: pag === 1 ? data.clicks : [...(s.data || []), ...data.clicks],
        total: data.total, pagina: pag, cargando: false,
      }))
      if (pag === 1) setTopUrls(data.top_urls)
    } catch {
      mostrar('error', 'Error al cargar clicks')
      setClicks(s => ({ ...s, cargando: false }))
    }
  }, [id])

  const cargarNoEntregados = useCallback(async (pag = 1) => {
    setNoEnt(s => ({ ...s, cargando: true }))
    try {
      const { data } = await api.get(`/reportes/campana/${id}/no-entregados?pagina=${pag}&por_pagina=50`)
      setNoEnt(s => ({
        data: pag === 1 ? data.sends : [...(s.data || []), ...data.sends],
        total: data.total, pagina: pag, cargando: false,
      }))
    } catch {
      mostrar('error', 'Error al cargar no entregados')
      setNoEnt(s => ({ ...s, cargando: false }))
    }
  }, [id])

  const onTabChange = (tab: string) => {
    setTabActiva(tab)
    if (tab === 'aperturas'     && !aperturas.data) cargarAperturas()
    if (tab === 'clicks'        && !clicks.data)    cargarClicks()
    if (tab === 'no-entregados' && !noEnt.data)     cargarNoEntregados()
  }

  const exportarCSV = async () => {
    setExportando(true)
    try {
      const resp = await api.get(`/reportes/campana/${id}/exportar`, { responseType: 'blob' })
      const url  = URL.createObjectURL(resp.data)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `reporte_campana_${id}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      mostrar('error', 'Error al exportar el CSV')
    } finally {
      setExportando(false)
    }
  }

  if (cargandoResumen) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!resumen) return null
  const { campana, tasas, estados_sends, eventos, top_urls, timeline } = resumen

  // Datos para DonutChart de estados de envío
  const segmentosEstados = estados_sends.map(e => ({
    label: e.estado.charAt(0).toUpperCase() + e.estado.slice(1),
    value: Number(e.total),
    color: COLORES_ESTADO[e.estado] || '#6b7280',
  }))

  // Datos para DonutChart de eventos
  const totalEventos = eventos.reduce((s, e) => s + Number(e.total), 0)
  const segmentosEventos = eventos.map(e => ({
    label: e.tipo.charAt(0).toUpperCase() + e.tipo.slice(1),
    value: Number(e.total),
    color: COLORES_EVENTO[e.tipo] || '#6b7280',
  }))

  // Timeline
  const fechas    = timeline.map(t => t.fecha)
  const tlEnv     = timeline.map(t => Number(t.enviados))
  const tlAper    = timeline.map(t => Number(t.aperturas))
  const tlClicks  = timeline.map(t => Number(t.clicks))
  const tlFallido = timeline.map(t => Number(t.fallidos))

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate('/reportes')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{campana.nombre}</h1>
            <Badge variant={campana.estado === 'completada' ? 'success' : 'secondary' as any}>
              {campana.estado}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5 truncate">{campana.asunto}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {campana.from_nombre} &lt;{campana.from_email}&gt;
            {campana.lista_nombre && ` · Lista: ${campana.lista_nombre}`}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => navigate(`/campanas/${campana.id}`)}
          >
            <Send className="h-4 w-4" /> Ver campaña
          </Button>
          <Button onClick={exportarCSV} disabled={exportando}>
            {exportando
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />
            }
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total envíos',   valor: formatearNumero(campana.total_envios), icon: Users,             color: 'text-muted-foreground', bg: 'bg-secondary' },
          { label: 'Enviados',       valor: formatearNumero(campana.enviados),     icon: CheckCircle2,      color: 'text-green-400',        bg: 'bg-green-500/10' },
          { label: 'Apertura',       valor: `${tasas.apertura}%`,                 icon: Eye,               color: 'text-violet-400',       bg: 'bg-violet-500/10' },
          { label: 'Clicks',         valor: `${tasas.click}%`,                    icon: MousePointerClick, color: 'text-blue-400',         bg: 'bg-blue-500/10' },
          { label: 'No entregados',  valor: `${tasas.error}%`,                    icon: AlertTriangle,     color: campana.fallidos > 0 ? 'text-red-400' : 'text-muted-foreground', bg: campana.fallidos > 0 ? 'bg-red-500/10' : 'bg-secondary' },
        ].map(({ label, valor, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 py-3">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div>
                <p className="text-xl font-bold leading-none">{valor}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs.Root value={tabActiva} onValueChange={onTabChange}>
        <Tabs.List className="flex gap-1 border-b border-border mb-4">
          {[
            { value: 'resumen',        label: 'Resumen & Gráficas' },
            { value: 'aperturas',      label: `Aperturas (${formatearNumero(campana.abiertos)})` },
            { value: 'clicks',         label: `Clicks (${formatearNumero(campana.clicks)})` },
            { value: 'no-entregados',  label: `No entregados (${formatearNumero(campana.fallidos)})` },
          ].map(tab => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tabActiva === tab.value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ── Tab: Resumen ──────────────────────────────────────────────────── */}
        <Tabs.Content value="resumen" className="space-y-4">
          {/* Donuts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Estado de los envíos</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center py-4">
                <DonutChart
                  segmentos={segmentosEstados}
                  titulo={formatearNumero(campana.total_envios)}
                  subtitulo="envíos total"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Interacciones registradas</CardTitle>
              </CardHeader>
              <CardContent className="flex justify-center py-4">
                <DonutChart
                  segmentos={segmentosEventos.length > 0 ? segmentosEventos : [{ label: 'Sin datos', value: 1, color: '#374151' }]}
                  titulo={formatearNumero(totalEventos)}
                  subtitulo="eventos totales"
                />
              </CardContent>
            </Card>
          </div>

          {/* Timeline */}
          {timeline.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Actividad diaria de la campaña</CardTitle>
              </CardHeader>
              <CardContent>
                <LineChart
                  etiquetas={fechas}
                  series={[
                    { label: 'Enviados', color: '#22c55e', datos: tlEnv },
                    { label: 'Aperturas', color: '#8b5cf6', datos: tlAper },
                    { label: 'Clicks',   color: '#06b6d4', datos: tlClicks },
                    { label: 'Fallidos', color: '#ef4444', datos: tlFallido },
                  ]}
                  altura={220}
                />
                <LineChartLeyenda series={[
                  { label: 'Enviados',  color: '#22c55e' },
                  { label: 'Aperturas', color: '#8b5cf6' },
                  { label: 'Clicks',    color: '#06b6d4' },
                  { label: 'Fallidos',  color: '#ef4444' },
                ]} />
              </CardContent>
            </Card>
          )}

          {/* Top URLs */}
          {top_urls.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">URLs más clickeadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {top_urls.map((url, i) => {
                  const max = top_urls[0].total
                  const pct = Math.round((url.total / max) * 100)
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <a
                          href={url.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate max-w-[400px] flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {url.url}
                        </a>
                        <span className="font-medium shrink-0">{url.total} clicks</span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full">
                        <div
                          className="h-full gradient-brand rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </Tabs.Content>

        {/* ── Tab: Aperturas ────────────────────────────────────────────────── */}
        <Tabs.Content value="aperturas">
          <TablaContactos
            data={aperturas.data}
            total={aperturas.total}
            cargando={aperturas.cargando}
            onCargarMas={() => cargarAperturas(aperturas.pagina + 1)}
            columnas={[
              { label: 'Email / Contacto', render: (r: AperturaRow) => (
                <div>
                  <p className="font-medium">{r.email}</p>
                  {r.nombre && <p className="text-xs text-muted-foreground">{r.nombre}{r.empresa ? ` · ${r.empresa}` : ''}</p>}
                </div>
              )},
              { label: 'Primera apertura', render: (r: AperturaRow) => (
                <span className="text-sm text-muted-foreground">{r.primera_apertura ? formatearFecha(r.primera_apertura) : '—'}</span>
              )},
              { label: 'Nº aperturas', render: (r: AperturaRow) => (
                <Badge variant="secondary">{r.total_aperturas}</Badge>
              )},
              { label: 'IP', render: (r: AperturaRow) => (
                <span className="text-xs text-muted-foreground font-mono">{r.ip || '—'}</span>
              )},
            ]}
            vacioMsg="Nadie ha abierto este email todavía"
            vacioIcon={<Eye className="h-10 w-10 opacity-40 mx-auto mb-3" />}
          />
        </Tabs.Content>

        {/* ── Tab: Clicks ───────────────────────────────────────────────────── */}
        <Tabs.Content value="clicks" className="space-y-4">
          {topUrls.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Desglose por URL</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topUrls.slice(0, 5).map((u, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold shrink-0">
                      {i + 1}
                    </span>
                    <a
                      href={u.url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-primary hover:underline truncate"
                    >
                      {u.url}
                    </a>
                    <span className="text-muted-foreground shrink-0">{u.total} clicks · {u.contactos_unicos} únicos</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <TablaContactos
            data={clicks.data}
            total={clicks.total}
            cargando={clicks.cargando}
            onCargarMas={() => cargarClicks(clicks.pagina + 1)}
            columnas={[
              { label: 'Email / Contacto', render: (r: ClickRow) => (
                <div>
                  <p className="font-medium">{r.email}</p>
                  {r.nombre && <p className="text-xs text-muted-foreground">{r.nombre}{r.empresa ? ` · ${r.empresa}` : ''}</p>}
                </div>
              )},
              { label: 'Primer click', render: (r: ClickRow) => (
                <span className="text-sm text-muted-foreground">{r.primer_click ? formatearFecha(r.primer_click) : '—'}</span>
              )},
              { label: 'Nº clicks', render: (r: ClickRow) => (
                <Badge variant="info">{r.total_clicks}</Badge>
              )},
              { label: 'URLs visitadas', render: (r: ClickRow) => (
                <div className="space-y-0.5 max-w-[240px]">
                  {r.urls.slice(0, 2).map((u, i) => (
                    <a
                      key={i} href={u} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline block truncate"
                    >
                      {u}
                    </a>
                  ))}
                  {r.urls.length > 2 && (
                    <span className="text-[11px] text-muted-foreground">+{r.urls.length - 2} más</span>
                  )}
                </div>
              )},
            ]}
            vacioMsg="Nadie ha hecho click todavía"
            vacioIcon={<MousePointerClick className="h-10 w-10 opacity-40 mx-auto mb-3" />}
          />
        </Tabs.Content>

        {/* ── Tab: No entregados ────────────────────────────────────────────── */}
        <Tabs.Content value="no-entregados">
          <TablaContactos
            data={noEnt.data}
            total={noEnt.total}
            cargando={noEnt.cargando}
            onCargarMas={() => cargarNoEntregados(noEnt.pagina + 1)}
            columnas={[
              { label: 'Email / Contacto', render: (r: NoEntRow) => (
                <div>
                  <p className="font-medium">{r.email}</p>
                  {r.nombre && <p className="text-xs text-muted-foreground">{r.nombre}{r.empresa ? ` · ${r.empresa}` : ''}</p>}
                </div>
              )},
              { label: 'Estado', render: (r: NoEntRow) => (
                <Badge variant={r.estado === 'rebotado' ? 'warning' : 'destructive' as any}>
                  {r.estado}
                </Badge>
              )},
              { label: 'Intentos', render: (r: NoEntRow) => (
                <span className="text-sm">{r.intentos}</span>
              )},
              { label: 'Error', render: (r: NoEntRow) => (
                <span className="text-xs text-red-400 max-w-[200px] block truncate" title={r.ultimo_error || ''}>
                  {r.ultimo_error || '—'}
                </span>
              )},
            ]}
            vacioMsg="¡Excelente! Sin emails no entregados"
            vacioIcon={<CheckCircle2 className="h-10 w-10 opacity-40 mx-auto mb-3 text-green-400" />}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}

// ─── Componente tabla reutilizable ────────────────────────────────────────────
interface Col<T> { label: string; render: (row: T) => React.ReactNode }

function TablaContactos<T extends { send_id: number }>({
  data, total, cargando, onCargarMas, columnas, vacioMsg, vacioIcon,
}: {
  data: T[] | null; total: number; cargando: boolean
  onCargarMas: () => void
  columnas: Col<T>[]
  vacioMsg: string; vacioIcon: React.ReactNode
}) {
  if (cargando && !data) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          {vacioIcon}
          <p>{vacioMsg}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-sm text-muted-foreground">{formatearNumero(total)} registros</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columnas.map(c => (
                <th key={c.label} className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.send_id} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                {columnas.map((c, i) => (
                  <td key={i} className="py-2.5 px-4">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length < total && (
        <div className="p-3 border-t border-border text-center">
          <Button variant="ghost" size="sm" onClick={onCargarMas} disabled={cargando}>
            {cargando
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : `Cargar más (${formatearNumero(total - data.length)} restantes)`
            }
          </Button>
        </div>
      )}
    </Card>
  )
}
