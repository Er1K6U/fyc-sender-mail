import { useEffect, useState } from 'react'
import {
  Timer, Gauge, Server, TrendingDown, TrendingUp, ShieldAlert,
  OctagonAlert, Pause, Hourglass, Minus,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn, formatearNumero } from '@/lib/utils'

export interface Telemetria {
  campaignId: number
  estado: string
  generado_en: number
  espera: {
    motivo: string
    proximo_envio_en: number | null
    reanudar_en: number | null
  }
  ventana: {
    campana: { usados: number; limite: number; porcentaje: number }
    cuenta: { nombre: string | null; usados: number; limite: number; porcentaje: number }
  }
  ritmo: {
    real_por_min: number
    configurado_por_min: number
    real_por_hora: number
    configurado_por_hora: number
    desviacion_pct: number
  }
  pausa: { numero: number; reanudar_en: number | null; ultimo_error: string | null } | null
  corte: { fallos_consecutivos: number; ultimo_error: string | null } | null
}

/** Texto e icono de cada motivo de espera. */
const MOTIVOS: Record<string, { titulo: string; detalle: string; icon: typeof Timer; color: string }> = {
  espaciado: {
    titulo: 'Espaciado normal',
    detalle: 'Esperando el intervalo configurado entre correos. Todo va según lo previsto.',
    icon: Timer,
    color: 'text-primary',
  },
  limite_campana: {
    titulo: 'Límite horario de la campaña alcanzado',
    detalle: 'Esta campaña ya envió su cupo de la última hora. Reanuda sola en cuanto se libere hueco.',
    icon: Gauge,
    color: 'text-orange-400',
  },
  limite_cuenta: {
    titulo: 'Límite horario de la cuenta SMTP alcanzado',
    detalle: 'La cuenta agotó su cupo horario sumando todas las campañas que la usan, no solo esta.',
    icon: Server,
    color: 'text-orange-400',
  },
  pausa_proveedor: {
    titulo: 'Pausada por bloqueo del proveedor',
    detalle: 'Gmail limitó los envíos. La campaña espera antes de reanudar para proteger la reputación.',
    icon: ShieldAlert,
    color: 'text-orange-400',
  },
  corte_fallos: {
    titulo: 'Detenida por fallos consecutivos',
    detalle: 'Corte de seguridad. No se reanuda sola: corrige el problema y reanúdala a mano.',
    icon: OctagonAlert,
    color: 'text-red-400',
  },
  pausa_manual: {
    titulo: 'Pausada manualmente',
    detalle: 'Alguien detuvo esta campaña. Reanúdala cuando quieras.',
    icon: Pause,
    color: 'text-muted-foreground',
  },
  inactiva: {
    titulo: 'Sin envíos en curso',
    detalle: 'La campaña no está enviando ahora mismo.',
    icon: Minus,
    color: 'text-muted-foreground',
  },
}

/** mm:ss, o h:mm:ss si pasa de la hora. */
function cuentaAtras(ms: number) {
  const seg = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  const s = seg % 60
  const dd = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${dd(m)}:${dd(s)}` : `${dd(m)}:${dd(s)}`
}

function BarraVentana({
  etiqueta, usados, limite, porcentaje, sub,
}: { etiqueta: string; usados: number; limite: number; porcentaje: number; sub?: string }) {
  const lleno = porcentaje >= 100
  const alto = porcentaje >= 80
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">{etiqueta}</span>
        <span className={cn(
          'text-xs font-medium tabular-nums shrink-0',
          lleno ? 'text-orange-400' : alto ? 'text-yellow-400' : 'text-foreground'
        )}>
          {formatearNumero(usados)} / {formatearNumero(limite)}
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            lleno ? 'bg-orange-500' : alto ? 'bg-yellow-500' : 'gradient-brand'
          )}
          style={{ width: `${Math.min(100, porcentaje)}%` }}
        />
      </div>
      {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
    </div>
  )
}

export default function PanelTelemetria({ datos }: { datos: Telemetria | null }) {
  // Reloj local: el servidor manda instantes absolutos y la cuenta atrás corre
  // aquí, así no hace falta tráfico por segundo.
  const [ahora, setAhora] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!datos) return null

  const motivo = MOTIVOS[datos.espera.motivo] || MOTIVOS.inactiva
  const Icono = motivo.icon

  // En pausa por proveedor el contador apunta a la reanudación; si no, al envío.
  const esPausaProveedor = datos.espera.motivo === 'pausa_proveedor'
  const objetivo = esPausaProveedor
    ? datos.espera.reanudar_en
    : datos.espera.proximo_envio_en

  const restante = objetivo !== null ? objetivo - ahora : null
  const hayContador = restante !== null && datos.espera.motivo !== 'corte_fallos'

  const { ritmo } = datos
  const desviacion = ritmo.desviacion_pct
  const vaLento = desviacion <= -25
  const IconoRitmo = vaLento ? TrendingDown : desviacion >= 25 ? TrendingUp : Minus

  return (
    <Card className="space-y-5">
      {/* Contador y motivo */}
      <div className="flex items-start gap-4">
        <div className={cn(
          'w-11 h-11 rounded-xl bg-secondary flex items-center justify-center shrink-0'
        )}>
          <Icono className={cn('h-5 w-5', motivo.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h3 className="font-semibold">{motivo.titulo}</h3>
            {esPausaProveedor && datos.pausa && datos.pausa.numero > 0 && (
              <Badge variant="orange" className="text-[10px]">
                Pausa nº {datos.pausa.numero}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {motivo.detalle}
          </p>

          {datos.corte && (
            <p className="text-xs text-red-400 mt-2">
              {datos.corte.fallos_consecutivos} fallos seguidos
              {datos.corte.ultimo_error && ` · ${datos.corte.ultimo_error}`}
            </p>
          )}
          {esPausaProveedor && datos.pausa?.ultimo_error && (
            <p className="text-[11px] text-muted-foreground/70 mt-2 truncate"
               title={datos.pausa.ultimo_error}>
              {datos.pausa.ultimo_error}
            </p>
          )}
        </div>

        {hayContador && (
          <div className="text-right shrink-0">
            <p className={cn(
              'font-mono font-bold text-2xl tabular-nums',
              esPausaProveedor ? 'text-orange-400' : 'text-primary'
            )}>
              {cuentaAtras(restante!)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {esPausaProveedor ? 'para reanudar' : 'al próximo envío'}
            </p>
          </div>
        )}
      </div>

      {/* Ventana móvil */}
      <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-border/50">
        <BarraVentana
          etiqueta="Esta campaña, última hora"
          usados={datos.ventana.campana.usados}
          limite={datos.ventana.campana.limite}
          porcentaje={datos.ventana.campana.porcentaje}
        />
        <BarraVentana
          etiqueta="Cuenta SMTP, última hora"
          usados={datos.ventana.cuenta.usados}
          limite={datos.ventana.cuenta.limite}
          porcentaje={datos.ventana.cuenta.porcentaje}
          sub={datos.ventana.cuenta.nombre
            ? `${datos.ventana.cuenta.nombre} · suma de todas sus campañas`
            : undefined}
        />
      </div>

      {/* Ritmo real vs configurado */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <IconoRitmo className={cn(
            'h-4 w-4 shrink-0',
            vaLento ? 'text-red-400' : desviacion >= 25 ? 'text-green-400' : 'text-muted-foreground'
          )} />
          <span className="text-xs text-muted-foreground">Ritmo real vs configurado</span>
        </div>
        <div className="flex items-baseline gap-2 shrink-0">
          <span className={cn(
            'font-medium tabular-nums',
            vaLento ? 'text-red-400' : 'text-foreground'
          )}>
            {ritmo.real_por_min}/min
          </span>
          <span className="text-xs text-muted-foreground">
            de {ritmo.configurado_por_min}/min
          </span>
          {datos.estado === 'enviando' && (
            <Badge
              variant={vaLento ? 'destructive' : desviacion >= 25 ? 'success' : 'secondary'}
              className="text-[10px]"
            >
              {desviacion > 0 ? '+' : ''}{desviacion}%
            </Badge>
          )}
        </div>
      </div>

      {vaLento && datos.estado === 'enviando' && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/5 border border-red-500/20 p-3">
          <Hourglass className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Va <strong>{Math.abs(desviacion)}% por debajo</strong> de lo configurado. Mira el
            motivo de espera de arriba y el log para saber qué lo está frenando.
          </p>
        </div>
      )}
    </Card>
  )
}
