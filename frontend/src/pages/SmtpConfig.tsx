import { useEffect, useState } from 'react'
import {
  Server, Plus, Trash2, CheckCircle2, XCircle,
  Send, Eye, EyeOff, Wifi, WifiOff, BarChart2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatearNumero } from '@/lib/utils'
import api from '@/lib/api'

interface SmtpConfig {
  id: number
  nombre: string
  host: string
  puerto: number
  seguro: number
  usuario: string
  from_nombre: string
  from_email: string
  limite_dia: number
  enviados_hoy: number
  activo: number
  verificado: number
}

const FORM_VACIO = {
  nombre: '',
  host: 'smtp.gmail.com',
  puerto: '587',
  seguro: false,
  usuario: '',
  password: '',
  from_nombre: '',
  from_email: '',
  limite_dia: '500',
}

export default function SmtpConfig() {
  const [configs, setConfigs] = useState<SmtpConfig[]>([])
  const [cargando, setCargando] = useState(true)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [mostrarPass, setMostrarPass] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [probando, setProbando] = useState<number | null>(null)
  const [emailPrueba, setEmailPrueba] = useState('')
  const [modalPrueba, setModalPrueba] = useState<number | null>(null)
  const { mostrar } = useToast()

  const cargar = async () => {
    try {
      const { data } = await api.get('/smtp')
      setConfigs(data.smtp_configs)
    } catch {
      mostrar('error', 'Error al cargar configuraciones SMTP')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [])

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api.post('/smtp', {
        ...form,
        puerto: parseInt(form.puerto),
        seguro: form.seguro ? 1 : 0,
        limite_dia: parseInt(form.limite_dia),
      })
      mostrar('success', 'Configuración SMTP guardada')
      setForm(FORM_VACIO)
      setMostrarFormulario(false)
      cargar()
    } catch (err: any) {
      mostrar('error', 'Error al guardar', err.response?.data?.error)
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (id: number) => {
    if (!confirm('¿Eliminar esta configuración SMTP?')) return
    try {
      await api.delete(`/smtp/${id}`)
      mostrar('success', 'Configuración eliminada')
      setConfigs(prev => prev.filter(c => c.id !== id))
    } catch {
      mostrar('error', 'Error al eliminar')
    }
  }

  const handleProbar = async (id: number) => {
    if (!emailPrueba) {
      mostrar('warning', 'Ingresa un email de destino para la prueba')
      return
    }
    setProbando(id)
    try {
      const { data } = await api.post(`/smtp/${id}/test`, { email_destino: emailPrueba })
      if (data.ok) {
        mostrar('success', '✅ Conexión exitosa', data.mensaje)
        cargar()
      } else {
        mostrar('error', '❌ Falló la prueba', data.mensaje)
      }
    } catch (err: any) {
      mostrar('error', 'Error en prueba SMTP', err.response?.data?.mensaje)
    } finally {
      setProbando(null)
      setModalPrueba(null)
      setEmailPrueba('')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuración SMTP</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona tus cuentas de envío Gmail Workspace
          </p>
        </div>
        <Button onClick={() => setMostrarFormulario(!mostrarFormulario)}>
          <Plus className="h-4 w-4" />
          Agregar cuenta
        </Button>
      </div>

      {/* Guía Gmail App Password */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="flex gap-3 py-4">
          <span className="text-2xl">💡</span>
          <div className="text-sm">
            <p className="font-medium text-amber-400 mb-1">Gmail requiere App Password</p>
            <p className="text-muted-foreground">
              No uses tu contraseña normal. Ve a{' '}
              <strong className="text-foreground">Google Account → Seguridad → Verificación en 2 pasos → Contraseñas de aplicación</strong>.
              Gmail Workspace permite ~2,000 emails/día por cuenta.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Formulario nuevo SMTP */}
      {mostrarFormulario && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva cuenta SMTP</CardTitle>
            <CardDescription>
              Completa los datos de conexión SMTP de Gmail
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGuardar} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nombre / Alias"
                placeholder="Gmail Principal"
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                required
              />
              <Input
                label="Host SMTP"
                placeholder="smtp.gmail.com"
                value={form.host}
                onChange={e => setForm({ ...form, host: e.target.value })}
                required
              />
              <Input
                label="Puerto"
                type="number"
                placeholder="587"
                value={form.puerto}
                onChange={e => setForm({ ...form, puerto: e.target.value })}
                required
              />
              <div className="flex items-center gap-3 pt-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={form.seguro}
                    onChange={e => setForm({ ...form, seguro: e.target.checked })}
                    className="w-4 h-4 accent-primary"
                  />
                  <span>SSL/TLS (puerto 465)</span>
                </label>
              </div>
              <Input
                label="Usuario (email de la cuenta)"
                type="email"
                placeholder="tucuenta@gmail.com"
                value={form.usuario}
                onChange={e => setForm({ ...form, usuario: e.target.value })}
                required
              />
              <div className="relative">
                <Input
                  label="App Password de Google"
                  type={mostrarPass ? 'text' : 'password'}
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setMostrarPass(!mostrarPass)}
                  className="absolute right-3 top-8 text-muted-foreground hover:text-foreground"
                >
                  {mostrarPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Input
                label="Nombre del remitente"
                placeholder="Mi Empresa"
                value={form.from_nombre}
                onChange={e => setForm({ ...form, from_nombre: e.target.value })}
                required
              />
              <Input
                label="Email del remitente (from)"
                type="email"
                placeholder="noreply@tudominio.com"
                value={form.from_email}
                onChange={e => setForm({ ...form, from_email: e.target.value })}
                required
              />
              <Input
                label="Límite diario de envíos"
                type="number"
                placeholder="500"
                value={form.limite_dia}
                onChange={e => setForm({ ...form, limite_dia: e.target.value })}
              />

              <div className="md:col-span-2 flex gap-3 pt-2">
                <Button type="submit" loading={guardando}>
                  Guardar configuración
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setMostrarFormulario(false); setForm(FORM_VACIO) }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Lista de configuraciones */}
      {cargando ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : configs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Server className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="font-medium text-muted-foreground">No hay cuentas SMTP configuradas</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Agrega tu primera cuenta Gmail para empezar a enviar
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {configs.map(config => {
            const porcentajeUsado = config.limite_dia > 0
              ? Math.round((config.enviados_hoy / config.limite_dia) * 100)
              : 0

            return (
              <Card key={config.id} className={!config.activo ? 'opacity-60' : ''}>
                <CardContent className="flex items-start gap-4 py-5">
                  {/* Ícono estado */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.verificado ? 'bg-green-500/15' : 'bg-muted'}`}>
                    {config.verificado
                      ? <Wifi className="h-5 w-5 text-green-400" />
                      : <WifiOff className="h-5 w-5 text-muted-foreground" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{config.nombre}</h3>
                      {config.verificado
                        ? <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Verificado</Badge>
                        : <Badge variant="secondary"><XCircle className="h-3 w-3" /> Sin verificar</Badge>}
                      {!config.activo && <Badge variant="outline">Inactivo</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {config.from_nombre} &lt;{config.from_email}&gt; · {config.host}:{config.puerto}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Usuario: {config.usuario}
                    </p>

                    {/* Barra de cuota */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span className="flex items-center gap-1">
                          <BarChart2 className="h-3 w-3" />
                          Cuota hoy
                        </span>
                        <span>
                          {formatearNumero(config.enviados_hoy)} / {formatearNumero(config.limite_dia)}
                          {' '}({porcentajeUsado}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full">
                        <div
                          className={`h-full rounded-full transition-all ${
                            porcentajeUsado > 80 ? 'bg-red-500' :
                            porcentajeUsado > 50 ? 'bg-yellow-500' : 'gradient-brand'
                          }`}
                          style={{ width: `${Math.min(porcentajeUsado, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2 shrink-0">
                    {modalPrueba === config.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="email@prueba.com"
                          type="email"
                          value={emailPrueba}
                          onChange={e => setEmailPrueba(e.target.value)}
                          className="w-44 h-9"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleProbar(config.id)}
                          loading={probando === config.id}
                        >
                          <Send className="h-3 w-3" />
                          Enviar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setModalPrueba(null)}
                        >
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setModalPrueba(config.id)}
                        >
                          <Wifi className="h-3.5 w-3.5" />
                          Probar
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleEliminar(config.id)}
                          className="text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
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
