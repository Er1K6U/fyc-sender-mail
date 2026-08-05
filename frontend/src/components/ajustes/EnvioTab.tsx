import { useEffect, useState } from 'react'
import {
  Gauge, ShieldCheck, Timer, Shuffle, TrendingUp, Sparkles,
  Loader2, Info, Layers, Plug, AlertTriangle, ShieldAlert,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import api from '@/lib/api'
import type { ThrottleConfig } from '@/types/usuario'

// Valores conservadores recomendados para máxima entregabilidad en Gmail/Workspace.
const RECOMENDADOS = {
  emails_por_min: '20',
  emails_por_hora: '200',
  pausa_entre_lotes_ms: '3000',
  jitter_pct: '20',
  smtp_max_connections: '2',
  smtp_max_messages: '50',
  pausa_limite_base_min: '15',
  corte_fallos_consecutivos: '5',
}

// Tabla de warmup gradual para cuentas nuevas (informativa).
const RAMP_UP = [
  { dias: 'Días 1-3', limite: '20-40 / día', nota: 'Arranque suave, solo contactos muy activos' },
  { dias: 'Días 4-7', limite: '50-100 / día', nota: 'Incrementa si no hay rebotes ni quejas' },
  { dias: 'Semana 2', limite: '150-300 / día', nota: 'Vigila la tasa de apertura (>15% ideal)' },
  { dias: 'Semana 3', limite: '400-700 / día', nota: 'Mantén baja la tasa de spam (<0.1%)' },
  { dias: 'Semana 4+', limite: '1000+ / día', nota: 'Cuenta "caliente": escala según reputación' },
]

export default function EnvioTab() {
  const [form, setForm] = useState({
    emails_por_min: '',
    emails_por_hora: '',
    pausa_entre_lotes_ms: '',
    jitter_pct: '',
    warmup_activo: true,
    smtp_max_connections: '',
    smtp_max_messages: '',
    pausa_limite_base_min: '',
    corte_fallos_consecutivos: '',
  })
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const { mostrar } = useToast()

  const cargar = async () => {
    try {
      const { data } = await api.get('/settings/throttle')
      const t: ThrottleConfig = data.throttle
      setForm({
        emails_por_min: String(t.emails_por_min),
        emails_por_hora: String(t.emails_por_hora),
        pausa_entre_lotes_ms: String(t.pausa_entre_lotes_ms),
        jitter_pct: String(t.jitter_pct),
        warmup_activo: t.warmup_activo,
        smtp_max_connections: String(t.smtp_max_connections),
        smtp_max_messages: String(t.smtp_max_messages),
        pausa_limite_base_min: String(t.pausa_limite_base_min),
        corte_fallos_consecutivos: String(t.corte_fallos_consecutivos),
      })
    } catch {
      mostrar('error', 'Error al cargar la configuración de envío')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const aplicarRecomendados = () => {
    setForm(f => ({ ...f, ...RECOMENDADOS }))
    mostrar('info', 'Valores recomendados aplicados', 'Recuerda guardar para confirmar los cambios.')
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      await api.put('/settings/throttle', {
        emails_por_min: parseInt(form.emails_por_min),
        emails_por_hora: parseInt(form.emails_por_hora),
        pausa_entre_lotes_ms: parseInt(form.pausa_entre_lotes_ms),
        jitter_pct: parseInt(form.jitter_pct),
        warmup_activo: form.warmup_activo,
        smtp_max_connections: parseInt(form.smtp_max_connections),
        smtp_max_messages: parseInt(form.smtp_max_messages),
        pausa_limite_base_min: parseInt(form.pausa_limite_base_min),
        corte_fallos_consecutivos: parseInt(form.corte_fallos_consecutivos),
      })
      mostrar('success', 'Configuración de envío guardada')
    } catch (err: any) {
      mostrar('error', 'Error al guardar', err.response?.data?.error)
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando configuración...
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Configuración de límites ── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center shadow-lg shadow-primary/30">
                <Gauge className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle>Límites globales de envío</CardTitle>
                <CardDescription>
                  Valores por defecto y tope máximo para todas las campañas.
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={aplicarRecomendados}>
              <Sparkles className="h-3.5 w-3.5" /> Usar recomendados
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>
              Estos valores <strong>precargan</strong> cada campaña nueva y además actúan como{' '}
              <strong>tope máximo</strong>: ninguna campaña podrá enviar más rápido que el límite por minuto global,
              aunque tenga configurado un valor mayor.
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Emails por minuto"
              type="number"
              min={1}
              value={form.emails_por_min}
              onChange={e => setForm({ ...form, emails_por_min: e.target.value })}
            />
            <Input
              label="Emails por hora"
              type="number"
              min={1}
              value={form.emails_por_hora}
              onChange={e => setForm({ ...form, emails_por_hora: e.target.value })}
            />
            <Input
              label="Pausa entre lotes (ms)"
              type="number"
              min={0}
              value={form.pausa_entre_lotes_ms}
              onChange={e => setForm({ ...form, pausa_entre_lotes_ms: e.target.value })}
            />
            <Input
              label="Randomización / jitter (%)"
              type="number"
              min={0}
              max={100}
              value={form.jitter_pct}
              onChange={e => setForm({ ...form, jitter_pct: e.target.value })}
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.warmup_activo}
              onChange={e => setForm({ ...form, warmup_activo: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">Mostrar guía de warmup gradual en esta página</span>
          </label>

        </CardContent>
      </Card>

      {/* ── Conexión SMTP (pooling) ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
              <Plug className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle>Conexión SMTP (pooling)</CardTitle>
              <CardDescription>
                Reutilización de la conexión para evitar bloqueos por exceso de logins.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="flex items-start gap-2 rounded-lg bg-orange-500/5 border border-orange-500/20 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
            <span>
              Gmail admite muy pocas conexiones autenticadas a la vez. Valores altos provocan el error{' '}
              <code className="text-orange-400">454-4.7.0 Too many login attempts</code>. Se recomienda{' '}
              <strong>1-2 conexiones</strong> y reciclar la conexión cada <strong>50 mensajes</strong>.
            </span>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Input
              label="Conexiones simultáneas"
              type="number"
              min={1}
              max={10}
              value={form.smtp_max_connections}
              onChange={e => setForm({ ...form, smtp_max_connections: e.target.value })}
            />
            <Input
              label="Mensajes por conexión"
              type="number"
              min={1}
              max={500}
              value={form.smtp_max_messages}
              onChange={e => setForm({ ...form, smtp_max_messages: e.target.value })}
            />
            <Input
              label="Pausa tras error 454 (min)"
              type="number"
              min={1}
              max={240}
              value={form.pausa_limite_base_min}
              onChange={e => setForm({ ...form, pausa_limite_base_min: e.target.value })}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/15 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>
              Si Gmail responde con un <strong>454</strong>, la campaña se <strong>pausa automáticamente</strong>{' '}
              durante ese tiempo y se reanuda sola. Si vuelve a ocurrir, la espera se duplica
              (backoff progresivo, hasta 8× la pausa base). El número de conexiones también define
              cuántos correos se procesan en paralelo.
            </span>
          </div>

        </CardContent>
      </Card>

      {/* ── Corte de seguridad ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-orange-400" />
            </div>
            <div>
              <CardTitle>Corte automático de seguridad</CardTitle>
              <CardDescription>
                Detiene una campaña si algo va mal, antes de quemar la lista entera.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4 items-start">
            <Input
              label="Fallos consecutivos para pausar"
              type="number"
              min={0}
              max={100}
              value={form.corte_fallos_consecutivos}
              onChange={e => setForm({ ...form, corte_fallos_consecutivos: e.target.value })}
            />
            <p className="text-xs text-muted-foreground leading-relaxed sm:pt-7">
              Cuentan solo los fallos <strong>seguidos</strong>: cualquier envío correcto
              reinicia el contador. Usa <strong>0</strong> para desactivar el corte.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-orange-500/5 border border-orange-500/20 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
            <span>
              Si se alcanza el umbral, la campaña se pausa y <strong>no se reanuda sola</strong>:
              suele indicar credenciales caducadas, un bloqueo del proveedor o una lista
              en mal estado. Corrige el problema y reanúdala a mano desde el detalle de
              la campaña.
            </span>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={guardar} loading={guardando}>Guardar configuración</Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Guía visual de buenas prácticas anti-spam ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Buenas prácticas anti-spam</h3>
          <Badge variant="secondary">Recomendaciones</Badge>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Warmup gradual</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Las cuentas nuevas no deben enviar miles de emails de golpe. Aumenta el volumen poco a poco
              durante 3-4 semanas para construir reputación con Gmail.
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Timer className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Pausas entre lotes</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Envía en lotes con pausas de unos segundos. Un goteo constante parece más humano que ráfagas
              masivas y reduce el riesgo de bloqueo temporal.
            </p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Shuffle className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Randomización de tiempos</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              El jitter añade variación aleatoria al intervalo entre envíos. Un patrón irregular evita la huella
              robótica que los filtros antispam detectan fácilmente.
            </p>
          </Card>
        </div>

        {/* Tabla de ramp-up */}
        {form.warmup_activo && (
          <Card className="mt-4">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Tabla de warmup recomendada (cuenta nueva)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                    <th className="px-3 py-2 font-medium">Periodo</th>
                    <th className="px-3 py-2 font-medium">Volumen sugerido</th>
                    <th className="px-3 py-2 font-medium">Recomendación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {RAMP_UP.map(r => (
                    <tr key={r.dias}>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.dias}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="info">{r.limite}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.nota}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              Guía orientativa. El warmup automático no está activo: ajusta manualmente los límites por campaña o el
              tope global a medida que tu cuenta gana reputación.
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
