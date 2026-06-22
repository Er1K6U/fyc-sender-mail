import { useState, useRef } from 'react'
import { Upload, ChevronRight, ChevronLeft, Check, AlertCircle, FileText, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

interface Lista {
  id: number
  nombre: string
}

interface Props {
  open: boolean
  onClose: () => void
  listas: Lista[]
  listaSeleccionada?: number
  onImportacionCompletada: () => void
}

type Paso = 'subir' | 'mapear' | 'confirmar'

interface Preview {
  archivo_id: string
  headers: string[]
  preview: Record<string, string>[]
  total: number
}

interface Resumen {
  total_filas: number
  insertados: number
  duplicados_archivo: number
  invalidos: number
  omitidos_duplicados_db: number
}

const CAMPOS_DESTINO = [
  { value: 'email', label: '📧 Email *', requerido: true },
  { value: 'nombre', label: '👤 Nombre' },
  { value: 'empresa', label: '🏢 Empresa' },
  { value: '__ignorar__', label: '— Ignorar columna' },
]

export default function ImportarWizard({
  open, onClose, listas, listaSeleccionada, onImportacionCompletada
}: Props) {
  const [paso, setPaso] = useState<Paso>('subir')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [cargandoArchivo, setCargandoArchivo] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapeo, setMapeo] = useState<Record<string, string>>({})
  const [listId, setListId] = useState<string>(listaSeleccionada?.toString() || '')
  const [importando, setImportando] = useState(false)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [erroresImport, setErroresImport] = useState<any[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const { mostrar } = useToast()

  const resetear = () => {
    setPaso('subir')
    setArchivo(null)
    setPreview(null)
    setMapeo({})
    setListId(listaSeleccionada?.toString() || '')
    setResumen(null)
    setErroresImport([])
  }

  const handleCerrar = () => {
    resetear()
    onClose()
  }

  const handleArchivo = async (file: File) => {
    setArchivo(file)
    setCargandoArchivo(true)
    try {
      const formData = new FormData()
      formData.append('archivo', file)
      const { data } = await api.post('/contactos/importar/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(data)

      // Auto-mapeo inteligente basado en nombres de columnas comunes
      const mapaAuto: Record<string, string> = {}
      data.headers.forEach((h: string) => {
        const lower = h.toLowerCase().trim()
        if (['email', 'correo', 'e-mail', 'mail'].some(k => lower.includes(k))) mapaAuto[h] = 'email'
        else if (['nombre', 'name', 'first name', 'firstname', 'full name'].some(k => lower.includes(k))) mapaAuto[h] = 'nombre'
        else if (['empresa', 'company', 'compañia', 'organización', 'org'].some(k => lower.includes(k))) mapaAuto[h] = 'empresa'
        else mapaAuto[h] = '__ignorar__'
      })
      setMapeo(mapaAuto)
      setPaso('mapear')
    } catch (err: any) {
      mostrar('error', 'Error al leer el archivo', err.response?.data?.error || err.message)
    } finally {
      setCargandoArchivo(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleArchivo(file)
  }

  const puedeAvanzarAMapeo = !!preview && !!listId
  const emailMapeado = Object.values(mapeo).includes('email')

  const handleImportar = async () => {
    if (!preview?.archivo_id) {
      mostrar('warning', 'Falta el archivo', 'Sube el archivo antes de importar')
      return
    }
    const listIdNum = parseInt(listId)
    if (!listId || isNaN(listIdNum) || listIdNum < 1) {
      mostrar('warning', 'Selecciona una lista', 'Debes elegir la lista de destino antes de importar')
      return
    }
    if (!emailMapeado) {
      mostrar('warning', 'Mapeo incompleto', 'Debes seleccionar la columna de email')
      return
    }
    setImportando(true)
    try {
      // Construir mapeo solo con columnas no ignoradas
      const mapeoFinal: Record<string, string> = {}
      Object.entries(mapeo).forEach(([col, campo]) => {
        if (campo !== '__ignorar__') mapeoFinal[campo] = col
      })

      const { data } = await api.post('/contactos/importar/ejecutar', {
        archivo_id: preview.archivo_id,
        list_id: listIdNum,
        mapeo: mapeoFinal,
      })
      setResumen(data.resumen)
      setErroresImport(data.errores || [])
      setPaso('confirmar')
      onImportacionCompletada()
    } catch (err: any) {
      mostrar('error', 'Error en importación', err.response?.data?.error)
    } finally {
      setImportando(false)
    }
  }

  const pasos = [
    { id: 'subir', label: 'Subir archivo', num: 1 },
    { id: 'mapear', label: 'Mapear columnas', num: 2 },
    { id: 'confirmar', label: 'Resultado', num: 3 },
  ]

  return (
    <Dialog open={open} onOpenChange={handleCerrar}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Importar contactos</DialogTitle>
          <DialogDescription>
            Importa contactos desde un archivo CSV o Excel con mapeo de columnas personalizado
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de pasos */}
        <div className="flex items-center gap-2 px-6 py-4">
          {pasos.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 flex-1">
              <div className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 transition-all',
                paso === p.id ? 'gradient-brand text-white' :
                pasos.findIndex(x => x.id === paso) > i
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-secondary text-muted-foreground'
              )}>
                {pasos.findIndex(x => x.id === paso) > i ? <Check className="h-3 w-3" /> : p.num}
              </div>
              <span className={cn('text-xs font-medium', paso === p.id ? 'text-foreground' : 'text-muted-foreground')}>
                {p.label}
              </span>
              {i < pasos.length - 1 && (
                <div className={cn('h-px flex-1 mx-2', pasos.findIndex(x => x.id === paso) > i ? 'bg-green-500/40' : 'bg-border')} />
              )}
            </div>
          ))}
        </div>

        <div className="px-6 pb-2">
          {/* ── PASO 1: Subir archivo ── */}
          {paso === 'subir' && (
            <div className="space-y-4">
              {/* Selector de lista */}
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger label="Lista de destino" error={!listId && archivo ? 'Selecciona una lista' : undefined}>
                  <SelectValue placeholder="Selecciona una lista..." />
                </SelectTrigger>
                <SelectContent>
                  {listas.map(l => (
                    <SelectItem key={l.id} value={l.id.toString()}>{l.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Zona de arrastrar/soltar */}
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200',
                  'hover:border-primary/50 hover:bg-primary/5',
                  archivo ? 'border-green-500/50 bg-green-500/5' : 'border-border'
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleArchivo(e.target.files[0])}
                />
                {cargandoArchivo ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground">Leyendo archivo...</p>
                  </div>
                ) : archivo ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-green-500/15 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-green-400">{archivo.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(archivo.size / 1024).toFixed(1)} KB · {preview?.total.toLocaleString('es-ES')} filas detectadas
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setArchivo(null); setPreview(null); }}
                      className="text-xs text-muted-foreground hover:text-red-400 flex items-center gap-1"
                    >
                      <X className="h-3 w-3" /> Cambiar archivo
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Arrastra tu archivo aquí</p>
                      <p className="text-sm text-muted-foreground mt-0.5">o haz click para seleccionar</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        CSV, XLS o XLSX · Máximo {parseInt(import.meta.env.VITE_UPLOAD_MAX_MB || '10')} MB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Guía de formato */}
              <div className="p-3 bg-secondary/50 rounded-lg text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Formato esperado del archivo:</p>
                <p>La primera fila debe contener los nombres de las columnas. El archivo debe tener al menos una columna de email.</p>
                <p className="mt-1">Ejemplo: <code className="bg-card px-1 rounded">nombre, email, empresa, cargo, telefono</code></p>
              </div>
            </div>
          )}

          {/* ── PASO 2: Mapear columnas ── */}
          {paso === 'mapear' && preview && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{preview.total.toLocaleString('es-ES')}</span> filas en{' '}
                  <span className="font-medium text-foreground">{archivo?.name}</span>
                </p>
                {!emailMapeado && (
                  <Badge variant="destructive">
                    <AlertCircle className="h-3 w-3" />
                    Falta mapear Email
                  </Badge>
                )}
                {emailMapeado && (
                  <Badge variant="success">
                    <Check className="h-3 w-3" />
                    Email mapeado
                  </Badge>
                )}
              </div>

              {/* Tabla de mapeo */}
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/50 border-b border-border">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-1/3">Columna del archivo</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-1/3">Mapear a campo</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Ejemplo (1ª fila)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.headers.map(header => (
                      <tr key={header} className="hover:bg-secondary/20">
                        <td className="px-4 py-2">
                          <code className="text-xs bg-secondary px-2 py-0.5 rounded">{header}</code>
                        </td>
                        <td className="px-4 py-2">
                          <Select
                            value={mapeo[header] || '__ignorar__'}
                            onValueChange={val => setMapeo(prev => ({ ...prev, [header]: val }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CAMPOS_DESTINO.map(campo => (
                                <SelectItem key={campo.value} value={campo.value}>
                                  {campo.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                          {preview.preview[0]?.[header] || <span className="italic">vacío</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Preview de primeras filas */}
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                  Ver primeras 5 filas del archivo
                </summary>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/50">
                        {preview.headers.map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.preview.map((fila, i) => (
                        <tr key={i}>
                          {preview.headers.map(h => (
                            <td key={h} className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{fila[h] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}

          {/* ── PASO 3: Resultado ── */}
          {paso === 'confirmar' && resumen && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                <Check className="h-6 w-6 text-green-400 shrink-0" />
                <div>
                  <p className="font-semibold text-green-400">Importación completada</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Se procesaron {resumen.total_filas.toLocaleString('es-ES')} filas correctamente
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: '✅ Insertados', valor: resumen.insertados, color: 'text-green-400' },
                  { label: '⚠️ Inválidos', valor: resumen.invalidos, color: 'text-yellow-400' },
                  { label: '🔁 Duplicados en archivo', valor: resumen.duplicados_archivo, color: 'text-blue-400' },
                  { label: '🔂 Ya existían en lista', valor: resumen.omitidos_duplicados_db, color: 'text-muted-foreground' },
                ].map(({ label, valor, color }) => (
                  <div key={label} className="p-3 bg-secondary/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`text-2xl font-bold mt-0.5 ${color}`}>{valor.toLocaleString('es-ES')}</p>
                  </div>
                ))}
              </div>

              {erroresImport.length > 0 && (
                <div className="border border-yellow-500/20 rounded-xl overflow-hidden">
                  <div className="bg-yellow-500/10 px-4 py-2 text-xs font-medium text-yellow-400 flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Primeros {erroresImport.length} registros con error (de {resumen.invalidos} total)
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-border">
                    {erroresImport.map((e, i) => (
                      <div key={i} className="px-4 py-2 text-xs text-muted-foreground">
                        <span className="text-foreground">Fila {e.fila}:</span> {e.motivo}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {paso === 'subir' && (
            <>
              <Button variant="outline" onClick={handleCerrar}>Cancelar</Button>
              <Button
                onClick={() => setPaso('mapear')}
                disabled={!puedeAvanzarAMapeo}
              >
                Siguiente <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          {paso === 'mapear' && (
            <>
              <Button variant="outline" onClick={() => setPaso('subir')}>
                <ChevronLeft className="h-4 w-4" /> Volver
              </Button>
              <Button onClick={handleImportar} loading={importando} disabled={!emailMapeado}>
                Importar {preview?.total.toLocaleString('es-ES')} contactos
              </Button>
            </>
          )}
          {paso === 'confirmar' && (
            <>
              <Button variant="outline" onClick={() => { resetear(); }}>
                Importar otro archivo
              </Button>
              <Button onClick={handleCerrar}>
                <Check className="h-4 w-4" /> Finalizar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
