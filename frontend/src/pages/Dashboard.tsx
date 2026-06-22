import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Send, Users, Mail, TrendingUp, Plus,
  Server, ArrowRight, CheckCircle2, Clock, XCircle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatearNumero, formatearFecha } from '@/lib/utils'
import api from '@/lib/api'

interface StatsGlobales {
  total_contactos: number
  total_campanas: number
  total_enviados: number
  tasa_apertura_promedio: number
  campanas_recientes: Array<{
    id: number
    nombre: string
    estado: string
    enviados: number
    total_envios: number
    created_at: string
  }>
}

const estadoBadge: Record<string, { label: string; variant: any; icon: React.ReactNode }> = {
  completada: { label: 'Completada', variant: 'success', icon: <CheckCircle2 className="h-3 w-3" /> },
  enviando: { label: 'Enviando', variant: 'info', icon: <Clock className="h-3 w-3" /> },
  programada: { label: 'Programada', variant: 'warning', icon: <Clock className="h-3 w-3" /> },
  error: { label: 'Error', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
  borrador: { label: 'Borrador', variant: 'secondary', icon: null },
}

export default function Dashboard() {
  const [stats, setStats] = useState<StatsGlobales | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(r => setStats(r.data))
      .catch(() => {
        // Datos de muestra mientras el endpoint no existe aún
        setStats({
          total_contactos: 0,
          total_campanas: 0,
          total_enviados: 0,
          tasa_apertura_promedio: 0,
          campanas_recientes: [],
        })
      })
      .finally(() => setCargando(false))
  }, [])

  const tarjetas = [
    { titulo: 'Contactos totales', valor: stats?.total_contactos ?? 0, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { titulo: 'Campañas enviadas', valor: stats?.total_campanas ?? 0, icon: Send, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { titulo: 'Emails enviados', valor: stats?.total_enviados ?? 0, icon: Mail, color: 'text-green-400', bg: 'bg-green-500/10' },
    { titulo: 'Tasa de apertura', valor: `${stats?.tasa_apertura_promedio ?? 0}%`, icon: TrendingUp, color: 'text-orange-400', bg: 'bg-orange-500/10', esTexto: true },
  ]

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Resumen general de tu plataforma de email marketing
          </p>
        </div>
        <Button asChild>
          <Link to="/campanas/nueva">
            <Plus className="h-4 w-4" />
            Nueva campaña
          </Link>
        </Button>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tarjetas.map(({ titulo, valor, icon: Icon, color, bg, esTexto }) => (
          <Card key={titulo} className="relative overflow-hidden">
            <div className={`absolute top-4 right-4 w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <CardContent>
              <p className="text-sm text-muted-foreground">{titulo}</p>
              <p className="text-3xl font-bold mt-1">
                {esTexto ? valor : formatearNumero(valor as number)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Inicio rápido si no hay datos */}
      {stats?.total_campanas === 0 && (
        <Card className="border-dashed border-border">
          <CardContent className="flex flex-col items-center text-center py-12">
            <div className="w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
              <Send className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold mb-2">¡Empieza aquí!</h3>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
              Configura tu cuenta SMTP, importa tus contactos y crea tu primera campaña de email en minutos.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button asChild variant="outline">
                <Link to="/smtp"><Server className="h-4 w-4" /> Configurar SMTP</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/contactos"><Users className="h-4 w-4" /> Importar contactos</Link>
              </Button>
              <Button asChild>
                <Link to="/campanas/nueva"><Plus className="h-4 w-4" /> Crear campaña</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campañas recientes */}
      {(stats?.campanas_recientes?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Campañas recientes</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/campanas">Ver todas <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats!.campanas_recientes.map(camp => {
                const info = estadoBadge[camp.estado] || estadoBadge.borrador
                const progreso = camp.total_envios > 0
                  ? Math.round((camp.enviados / camp.total_envios) * 100)
                  : 0
                return (
                  <div key={camp.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{camp.nombre}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatearFecha(camp.created_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {formatearNumero(camp.enviados)} / {formatearNumero(camp.total_envios)}
                      </p>
                      <div className="w-24 h-1.5 bg-secondary rounded-full mt-1">
                        <div
                          className="h-full gradient-brand rounded-full transition-all"
                          style={{ width: `${progreso}%` }}
                        />
                      </div>
                    </div>
                    <Badge variant={info.variant as any} className="shrink-0">
                      {info.icon}
                      {info.label}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
