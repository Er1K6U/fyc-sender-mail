import { useEffect, useState } from 'react'
import {
  Gauge, ShieldCheck, Timer, Shuffle, TrendingUp, Sparkles,
  Loader2, Info, Layers,
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
