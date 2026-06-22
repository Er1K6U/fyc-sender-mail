import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart2, Send, Eye, MousePointerClick, AlertTriangle,
  CheckCircle2, TrendingUp, Users, ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LineChart, LineChartLeyenda } from '@/components/charts/LineChart'
import { useToast } from '@/components/ui/toast'
import { formatearNumero, formatearFecha } from '@/lib/utils'
import api from '@/lib/api'

interface GeneralData {
  totales: {
    total_campanas: number; total_envios: number; total_enviados: number
    total_fallidos: number; total_abiertos: number; total_clicks: number
    completadas: number; en_envio: number; borradores: number
  }
  promedios: { tasa_apertura: string; tasa_clicks: string; tasa_error: string }
  ultimas_campanas: any[]
  actividad_diaria: { fecha: string; enviados: number }[]
}

export default function Reportes() {
  const [data, setData] = useState<GeneralData | null>(null)
  const [cargando, setCargando] = useState(true)
  const navigate = useNavigate()
  const { mostrar } = useToast()

  useEffect(() => {
    api.get('/reportes/general')
      .then(r => setData(r.data))
      .catch(() => mostrar('error', 'Error al cargar reportes'))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) return null

  const { totales, promedios, ultimas_campanas, actividad_diaria } = data

  // Preparar datos para LineChart de actividad diaria
  const fechas    = actividad_diaria.map(d => String(d.fecha).slice(0, 10))
  const enviados  = actividad_diaria.map(d => Number(d.enviados))

  // Preparar series para gráfica de últimas campañas
  const campañasInvertidas = [...ultimas_campanas].reverse()
  const etqCampanas = campañasInvertidas.map(c =>
    c.nombre.length > 12 ? c.nombre.slice(0, 12) + '…' : c.nombre
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Análisis y métricas de todas tus campañas
        </p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total enviados',
            valor: formatearNumero(totales.total_enviados),
            sub: `de ${formatearNumero(totales.total_envios)} intentos`,
            icon: Send,
            color: 'text-primary',
            bg: 'bg-primary/10',
          },
          {
            label: 'Tasa de apertura',
            valor: `${promedios.tasa_apertura}%`,
            sub: `${formatearNumero(totales.total_abiertos)} abiertos`,
            icon: Eye,
            color: 'text-violet-400',
            bg: 'bg-violet-500/10',
          },
          {
            label: 'Tasa de clicks',
            valor: `${promedios.tasa_clicks}%`,
            sub: `${formatearNumero(totales.total_clicks)} clicks`,
            icon: MousePointerClick,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
          },
          {
            label: 'Tasa de error',
            valor: `${promedios.tasa_error}%`,
            sub: `${formatearNumero(totales.total_fallidos)} fallidos`,
            icon: AlertTriangle,
            color: totales.total_fallidos > 0 ? 'text-red-400' : 'text-muted-foreground',
            bg: totales.total_fallidos > 0 ? 'bg-red-500/10' : 'bg-secondary',
          },
        ].map(({ label, valor, sub, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4 py-4">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{valor}</p>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="text-[11px] text-muted-foreground">{sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Contadores de estado */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Campañas completadas', valor: totales.completadas, icon: CheckCircle2, color: 'text-green-400' },
          { label: 'En envío ahora',        valor: totales.en_envio,   icon: TrendingUp,   color: 'text-blue-400' },
          { label: 'Total campañas',         valor: totales.total_campanas, icon: BarChart2, color: 'text-primary' },
        ].map(({ label, valor, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 py-3">
              <Icon className={`h-5 w-5 ${color} shrink-0`} />
              <div>
                <p className="text-xl font-bold">{formatearNumero(valor)}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Actividad diaria — últimos 30 días */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Emails enviados — últimos 30 días</CardTitle>
          </CardHeader>
          <CardContent>
            {fechas.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Sin actividad en los últimos 30 días
              </div>
            ) : (
              <>
                <LineChart
                  etiquetas={fechas}
                  series={[
                    { label: 'Enviados', color: 'hsl(var(--primary))', datos: enviados },
                  ]}
                  altura={200}
                />
                <LineChartLeyenda series={[{ label: 'Emails enviados', color: 'hsl(var(--primary))' }]} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Rendimiento por campaña */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Rendimiento por campaña</CardTitle>
          </CardHeader>
          <CardContent>
            {campañasInvertidas.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Sin campañas completadas aún
              </div>
            ) : (
              <>
                <LineChart
                  etiquetas={etqCampanas}
                  series={[
                    { label: 'Enviados', color: 'hsl(var(--primary))',   datos: campañasInvertidas.map(c => c.enviados) },
                    { label: 'Abiertos', color: '#8b5cf6',               datos: campañasInvertidas.map(c => c.abiertos) },
                    { label: 'Clicks',   color: '#06b6d4',               datos: campañasInvertidas.map(c => c.clicks)   },
                  ]}
                  altura={200}
                />
                <LineChartLeyenda series={[
                  { label: 'Enviados', color: 'hsl(var(--primary))' },
                  { label: 'Abiertos', color: '#8b5cf6' },
                  { label: 'Clicks',   color: '#06b6d4' },
                ]} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla de últimas campañas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Últimas campañas completadas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ultimas_campanas.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              No hay campañas completadas todavía
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Campaña</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Enviados</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Apertura</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Clicks</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Fallidos</th>
                  <th className="py-2.5 px-3" />
                </tr>
              </thead>
              <tbody>
                {ultimas_campanas.map(c => {
                  const tasaA = c.enviados > 0 ? Math.round((c.abiertos / c.enviados) * 100) : 0
                  const tasaC = c.enviados > 0 ? Math.round((c.clicks   / c.enviados) * 100) : 0
                  return (
                    <tr key={c.id} className="border-b border-border/40 hover:bg-secondary/30 transition-colors">
                      <td className="py-2.5 px-4">
                        <p className="font-medium truncate max-w-[200px]">{c.nombre}</p>
                        {c.completada_en && (
                          <p className="text-[11px] text-muted-foreground">{formatearFecha(c.completada_en)}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {formatearNumero(c.enviados)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={tasaA >= 20 ? 'text-green-400 font-medium' : 'text-muted-foreground'}>
                          {tasaA}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={tasaC >= 3 ? 'text-blue-400 font-medium' : 'text-muted-foreground'}>
                          {tasaC}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={c.fallidos > 0 ? 'text-red-400' : 'text-muted-foreground'}>
                          {formatearNumero(c.fallidos)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/reportes/campana/${c.id}`)}
                        >
                          Ver reporte <ChevronRight className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
