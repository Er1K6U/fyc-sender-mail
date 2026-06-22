import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Send, Users, FileText,
  Settings, Clock, Check, Calendar, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Lista { id: number; nombre: string; activos: number }
interface SmtpConfig { id: number; nombre?: string; from_nombre: string; from_email: string; host: string }
interface Plantilla { id: number; nombre: string; asunto: string; thumbnail_url?: string }

interface FormData {
  nombre: string
  asunto: string
  from_nombre: string
  from_email: string
  list_id: string
  smtp_config_id: string
  plantilla_id: string
  html_content: string
  emails_por_min: string
  emails_por_hora: string
  modo_envio: 'inmediato' | 'programado'
  programada_para: string
}

const PASOS = [
  { id: 1, label: 'Información',   icon: FileText },
  { id: 2, label: 'Plantilla',     icon: Send },
  { id: 3, label: 'Lista',         icon: Users },
  { id: 4, label: 'Configuración', icon: Settings },
  { id: 5, label: 'Envío',         icon: Clock },
]

// ─── Componente principal ─────────────────────────────────────────────────────
export default function NuevaCampana() {
  const navigate = useNavigate()
  const { mostrar } = useToast()
  const [paso, setPaso] = useState(1)
  const [guardando, setGuardando] = useState(false)

  const [listas, setListas] = useState<Lista[]>([])
  const [smtpConfigs, setSmtpConfigs] = useState<SmtpConfig[]>([])
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])

  const [form, setForm] = useState<FormData>({
    nombre: '',
    asunto: '',
    from_nombre: '',
    from_email: '',
    list_id: '',
    smtp_config_id: '',
    plantilla_id: '',
    html_content: '',
    emails_por_min: '30',
    emails_por_hora: '500',
    modo_envio: 'inmediato',
    programada_para: '',
  })

  useEffect(() => {
    const cargar = async () => {
      const [rListas, rSmtp, rPlantillas] = await Promise.all([
        api.get('/listas'),
        api.get('/smtp'),
        api.get('/plantillas'),
      ])
      setListas(rListas.data.listas)
      setSmtpConfigs(rSmtp.data.configs)
      setPlantillas(rPlantillas.data.plantillas)
      // Preseleccionar primer SMTP
      if (rSmtp.data.configs.length > 0) {
        const smtp = rSmtp.data.configs[0]
        setForm(f => ({
          ...f,
          smtp_config_id: String(smtp.id),
          from_nombre: smtp.from_nombre,
          from_email: smtp.from_email,
        }))
      }
    }
    cargar().catch(() => mostrar('error', 'Error al cargar datos'))
  }, [])

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
  }

  const seleccionarPlantilla = async (id: number) => {
    try {
      const { data } = await api.get(`/plantillas/${id}`)
      setForm(f => ({
        ...f,
        plantilla_id: String(id),
        html_content: data.plantilla.html_content,
        asunto: f.asunto || data.plantilla.asunto, // solo si no tiene asunto
      }))
    } catch {
      mostrar('error', 'Error al cargar plantilla')
    }
  }

  const validarPaso = (): string | null => {
    switch (paso) {
      case 1:
        if (!form.nombre.trim()) return 'El nombre de la campaña es requerido'
        if (!form.asunto.trim()) return 'El asunto es requerido'
        if (!form.from_nombre.trim() || !form.from_email.trim()) return 'El remitente es requerido'
        return null
      case 2:
        if (!form.plantilla_id) return 'Selecciona una plantilla'
        return null
      case 3:
        if (!form.list_id) return 'Selecciona una lista de contactos'
        return null
      case 4:
        if (!form.smtp_config_id) return 'Selecciona una configuración SMTP'
        return null
      case 5:
        if (form.modo_envio === 'programado' && !form.programada_para) return 'Indica la fecha y hora de envío'
        return null
    }
    return null
  }

  const avanzar = () => {
    const err = validarPaso()
    if (err) { mostrar('error', err); return }
    if (paso < 5) setPaso(p => p + 1)
  }

  const enviarCampana = async (iniciarAhora: boolean) => {
    const err = validarPaso()
    if (err) { mostrar('error', err); return }

    setGuardando(true)
    try {
      const payload: any = {
        nombre: form.nombre,
        asunto: form.asunto,
        from_nombre: form.from_nombre,
        from_email: form.from_email,
        list_id: Number(form.list_id),
        smtp_config_id: Number(form.smtp_config_id),
        plantilla_id: form.plantilla_id ? Number(form.plantilla_id) : undefined,
        html_content: form.html_content,
        emails_por_min: Number(form.emails_por_min),
        emails_por_hora: Number(form.emails_por_hora),
      }
      if (form.modo_envio === 'programado' && form.programada_para) {
        payload.programada_para = form.programada_para
      }

      const { data } = await api.post('/campanas', payload)
      const id = data.campana.id

      if (iniciarAhora) {
        await api.post(`/campanas/${id}/iniciar`)
        mostrar('success', '¡Campaña iniciada! Redirigiendo al dashboard...')
      } else if (form.modo_envio === 'programado') {
        mostrar('success', 'Campaña programada correctamente')
      } else {
        mostrar('success', 'Campaña guardada como borrador')
      }

      setTimeout(() => navigate(`/campanas/${id}`), 1000)
    } catch (err: any) {
      mostrar('error', err.response?.data?.error || 'Error al crear la campaña')
    } finally {
      setGuardando(false)
    }
  }

  const listaSeleccionada = listas.find(l => String(l.id) === form.list_id)

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate('/campanas')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nueva campaña</h1>
          <p className="text-sm text-muted-foreground">Configura y envía tu campaña de email</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {PASOS.map((p, i) => {
          const completado = paso > p.id
          const activo = paso === p.id
          const Icon = p.icon
          return (
            <div key={p.id} className="flex items-center flex-1">
              <button
                className={cn(
                  'flex items-center gap-2 text-sm font-medium transition-colors',
                  activo ? 'text-primary' :
                  completado ? 'text-green-400 cursor-pointer hover:text-green-300' :
                  'text-muted-foreground cursor-not-allowed'
                )}
                onClick={() => completado && setPaso(p.id)}
              >
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border',
                  activo ? 'bg-primary border-primary text-white' :
                  completado ? 'bg-green-500/20 border-green-500 text-green-400' :
                  'bg-secondary border-border text-muted-foreground'
                )}>
                  {completado ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span className="hidden sm:block">{p.label}</span>
              </button>
              {i < PASOS.length - 1 && (
                <div className={cn(
                  'flex-1 h-px mx-2',
                  completado ? 'bg-green-500/40' : 'bg-border'
                )} />
              )}
            </div>
          )
        })}
      </div>

      {/* Contenido del paso */}
      <Card>
        <CardHeader>
          <CardTitle>{PASOS[paso - 1].label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Paso 1: Información básica */}
          {paso === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre interno de la campaña *</Label>
                <Input
                  id="nombre"
                  placeholder="Ej: Newsletter Junio 2026"
                  value={form.nombre}
                  onChange={set('nombre')}
                />
                <p className="text-xs text-muted-foreground">Solo visible para ti, no aparece en el email</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="asunto">Asunto del email *</Label>
                <Input
                  id="asunto"
                  placeholder="Ej: 🎉 Novedades de junio para {{nombre}}"
                  value={form.asunto}
                  onChange={set('asunto')}
                />
                <p className="text-xs text-muted-foreground">Puedes usar variables como {'{{'+'nombre'+'}}'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="from_nombre">Nombre del remitente *</Label>
                  <Input
                    id="from_nombre"
                    placeholder="Tu Empresa"
                    value={form.from_nombre}
                    onChange={set('from_nombre')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="from_email">Email del remitente *</Label>
                  <Input
                    id="from_email"
                    type="email"
                    placeholder="hola@tuempresa.com"
                    value={form.from_email}
                    onChange={set('from_email')}
                  />
                </div>
              </div>
            </>
          )}

          {/* Paso 2: Plantilla */}
          {paso === 2 && (
            <div className="space-y-3">
              {plantillas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No tienes plantillas guardadas.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate('/constructor')}
                  >
                    Crear plantilla
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {plantillas.map(p => (
                    <button
                      key={p.id}
                      onClick={() => seleccionarPlantilla(p.id)}
                      className={cn(
                        'relative rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50',
                        form.plantilla_id === String(p.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-secondary/40'
                      )}
                    >
                      {p.thumbnail_url ? (
                        <img
                          src={p.thumbnail_url}
                          alt={p.nombre}
                          className="w-full aspect-video object-cover rounded mb-2 opacity-80"
                        />
                      ) : (
                        <div className="w-full aspect-video bg-secondary rounded mb-2 flex items-center justify-center">
                          <FileText className="h-8 w-8 text-muted-foreground/40" />
                        </div>
                      )}
                      <p className="text-xs font-semibold truncate">{p.nombre}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{p.asunto}</p>
                      {form.plantilla_id === String(p.id) && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {form.plantilla_id && (
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Plantilla seleccionada
                </p>
              )}
            </div>
          )}

          {/* Paso 3: Lista de contactos */}
          {paso === 3 && (
            <div className="space-y-3">
              {listas.map(lista => (
                <button
                  key={lista.id}
                  onClick={() => setForm(f => ({ ...f, list_id: String(lista.id) }))}
                  className={cn(
                    'w-full flex items-center gap-4 rounded-lg border-2 p-4 text-left transition-all hover:border-primary/50',
                    form.list_id === String(lista.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-secondary/40'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    form.list_id === String(lista.id) ? 'bg-primary/20' : 'bg-secondary'
                  )}>
                    <Users className={cn('h-5 w-5', form.list_id === String(lista.id) ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{lista.nombre}</p>
                    <p className="text-sm text-muted-foreground">
                      {lista.activos.toLocaleString('es-ES')} contactos activos
                    </p>
                  </div>
                  {form.list_id === String(lista.id) && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </button>
              ))}
              {listas.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No tienes listas de contactos.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate('/contactos')}
                  >
                    Importar contactos
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Paso 4: Configuración SMTP y throttling */}
          {paso === 4 && (
            <div className="space-y-5">
              <div className="space-y-3">
                <Label>Cuenta SMTP *</Label>
                {smtpConfigs.map(smtp => (
                  <button
                    key={smtp.id}
                    onClick={() => setForm(f => ({
                      ...f,
                      smtp_config_id: String(smtp.id),
                      from_nombre: f.from_nombre || smtp.from_nombre,
                      from_email: f.from_email || smtp.from_email,
                    }))}
                    className={cn(
                      'w-full flex items-center gap-4 rounded-lg border-2 p-4 text-left transition-all hover:border-primary/50',
                      form.smtp_config_id === String(smtp.id)
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-secondary/40'
                    )}
                  >
                    <div className="flex-1">
                      <p className="font-medium">{smtp.from_nombre} &lt;{smtp.from_email}&gt;</p>
                      <p className="text-xs text-muted-foreground">{smtp.host}</p>
                    </div>
                    {form.smtp_config_id === String(smtp.id) && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>

              <div className="border-t border-border pt-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Zap className="h-4 w-4 text-yellow-400" />
                  Throttling de envío
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="epm">Emails por minuto</Label>
                    <Input
                      id="epm"
                      type="number"
                      min={1}
                      max={500}
                      value={form.emails_por_min}
                      onChange={set('emails_por_min')}
                    />
                    <p className="text-xs text-muted-foreground">Recomendado: 20-60</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eph">Emails por hora</Label>
                    <Input
                      id="eph"
                      type="number"
                      min={1}
                      max={5000}
                      value={form.emails_por_hora}
                      onChange={set('emails_por_hora')}
                    />
                    <p className="text-xs text-muted-foreground">Gmail Workspace: ≤2000/día</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Paso 5: Modo de envío */}
          {paso === 5 && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="bg-secondary/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Campaña</span>
                  <span className="font-medium">{form.nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Asunto</span>
                  <span className="font-medium truncate max-w-[200px]">{form.asunto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lista</span>
                  <span className="font-medium">{listaSeleccionada?.nombre} ({listaSeleccionada?.activos.toLocaleString('es-ES')} contactos)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Velocidad</span>
                  <span className="font-medium">{form.emails_por_min} emails/min</span>
                </div>
                {listaSeleccionada && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tiempo estimado</span>
                    <span className="font-medium text-primary">
                      ~{Math.ceil(listaSeleccionada.activos / Number(form.emails_por_min))} minutos
                    </span>
                  </div>
                )}
              </div>

              {/* Modo de envío */}
              <div className="space-y-3">
                <Label>¿Cuándo enviar?</Label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: 'inmediato', label: 'Enviar ahora', desc: 'La campaña inicia inmediatamente', icon: Send },
                    { value: 'programado', label: 'Programar', desc: 'Elige fecha y hora de inicio', icon: Calendar },
                  ] as const).map(({ value, label, desc, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setForm(f => ({ ...f, modo_envio: value }))}
                      className={cn(
                        'flex flex-col gap-2 rounded-lg border-2 p-4 text-left transition-all hover:border-primary/50',
                        form.modo_envio === value
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-secondary/40'
                      )}
                    >
                      <Icon className={cn('h-5 w-5', form.modo_envio === value ? 'text-primary' : 'text-muted-foreground')} />
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {form.modo_envio === 'programado' && (
                <div className="space-y-2">
                  <Label htmlFor="fecha">Fecha y hora de envío *</Label>
                  <Input
                    id="fecha"
                    type="datetime-local"
                    value={form.programada_para}
                    onChange={set('programada_para')}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navegación */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => paso === 1 ? navigate('/campanas') : setPaso(p => p - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          {paso === 1 ? 'Cancelar' : 'Atrás'}
        </Button>

        {paso < 5 ? (
          <Button onClick={avanzar}>
            Siguiente <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => enviarCampana(false)}
              disabled={guardando}
            >
              {form.modo_envio === 'programado' ? 'Programar' : 'Guardar borrador'}
            </Button>
            {form.modo_envio === 'inmediato' && (
              <Button
                onClick={() => enviarCampana(true)}
                disabled={guardando}
              >
                {guardando ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar ahora
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
