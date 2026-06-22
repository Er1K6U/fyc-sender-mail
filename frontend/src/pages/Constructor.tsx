import { useRef, useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import EmailEditor, { type EditorRef, type EmailEditorProps } from 'react-email-editor'
import {
  Save, Eye, Download, FileText, Braces, Undo2,
  Monitor, Smartphone, Loader2, ChevronLeft, ChevronRight,
  Sparkles, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import VistaPrevia from '@/components/constructor/VistaPrevia'
import ModalGuardarPlantilla from '@/components/constructor/ModalGuardarPlantilla'
import PanelPlantillas from '@/components/constructor/PanelPlantillas'
import PanelVariables from '@/components/constructor/PanelVariables'
import { useConstructorStore } from '@/store/constructorStore'
import api from '@/lib/api'

type PanelLateral = 'plantillas' | 'variables' | null

// Diseño inicial con bloques demo para que el editor no aparezca vacío
const DISENO_INICIAL = {
  body: {
    id: 'start',
    rows: [
      {
        cells: [1],
        columns: [{
          contents: [{
            type: 'text',
            values: {
              text: '<h1 style="text-align:center;font-family:Arial,sans-serif;color:#1a1a2e;">¡Hola, {{nombre}}!</h1><p style="text-align:center;color:#555;font-family:Arial,sans-serif;">Empieza a construir tu email arrastrando bloques desde el panel derecho.</p>',
              containerPadding: '20px',
            },
          }],
          values: { _meta: { htmlID: 'u_column_1', htmlClassNames: 'u_column' } },
        }],
        values: {
          backgroundColor: '#ffffff',
          padding: '30px 20px',
          _meta: { htmlID: 'u_row_1', htmlClassNames: 'u_row' },
        },
      },
    ],
    values: {
      backgroundColor: '#f4f4f8',
      contentWidth: '600px',
      fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
      preheaderText: '',
    },
  },
  counters: { u_row: 1, u_column: 1, u_content_text: 1 },
  schemaVersion: 16,
}

export default function Constructor() {
  const editorRef = useRef<EditorRef>(null)
  const [editorListo, setEditorListo] = useState(false)
  const [panelAbierto, setPanelAbierto] = useState<PanelLateral>('plantillas')
  const [vistaPreviaAbierta, setVistaPreviaAbierta] = useState(false)
  const [modalGuardarAbierto, setModalGuardarAbierto] = useState(false)
  const [htmlPrevia, setHtmlPrevia] = useState('')
  const [exportando, setExportando] = useState(false)

  const {
    asunto, setAsunto,
    nombrePlantilla, setNombrePlantilla,
    plantillaId, setPlantillaId,
    modificado, setModificado,
    resetear,
  } = useConstructorStore()

  const { mostrar } = useToast()
  const [searchParams] = useSearchParams()

  // Cargar plantilla desde URL query param al montar (cuando editor esté listo)
  useEffect(() => {
    const idParam = searchParams.get('plantilla')
    if (!idParam || !editorListo) return
    api.get(`/plantillas/${idParam}`)
      .then(({ data }) => handleCargarPlantilla(data.plantilla))
      .catch(() => mostrar('error', 'No se pudo cargar la plantilla indicada'))
  }, [editorListo, searchParams])

  // ── Opciones de Unlayer ──────────────────────────────────────────────────
  const opcionesEditor: EmailEditorProps['options'] = {
    displayMode: 'email',
    locale: 'es-ES',
    appearance: {
      theme: 'dark',
      panels: {
        tools: { dock: 'right' },
      },
    },
    projectId: 0,
    tools: {
      // Activar soporte para GIFs e imágenes
      image: { enabled: true },
      video: { enabled: true },
    },
    features: {
      stockImages: { enabled: false }, // desactivar stock de Unsplash (requiere API key)
      sendTestEmail: false,
      preheaderText: true,
      textEditor: {
        spellChecker: false,
        cleanPaste: true,
      },
    },
    mergeTags: {
      nombre: { name: 'Nombre del contacto', value: '{{nombre}}', sample: 'María García' },
      email: { name: 'Email del contacto', value: '{{email}}', sample: 'maria@ejemplo.com' },
      empresa: { name: 'Empresa', value: '{{empresa}}', sample: 'Acme Corp' },
      fecha: { name: 'Fecha de envío', value: '{{fecha}}', sample: new Date().toLocaleDateString('es-ES') },
      año: { name: 'Año', value: '{{año}}', sample: new Date().getFullYear().toString() },
      link_unsub: { name: 'Link de desuscripción', value: '{{link_unsub}}', sample: 'https://ejemplo.com/unsub' },
    },
  }

  // ── Callback al estar listo el editor ───────────────────────────────────
  const onEditorListo: EmailEditorProps['onReady'] = useCallback((unlayer) => {
    setEditorListo(true)

    // Cargar diseño inicial
    unlayer.loadDesign(DISENO_INICIAL as any)

    // Registrar callback de upload de imágenes para Unlayer
    unlayer.registerCallback('image', async (file: any, done: any) => {
      try {
        const formData = new FormData()
        formData.append('imagen', file.attachments[0])
        const { data } = await api.post('/uploads/imagen', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        done({ progress: 100, url: data.url })
      } catch (error) {
        mostrar('error', 'Error al subir imagen')
        done({ progress: 0 })
      }
    })

    // Detectar cambios en el diseño
    unlayer.addEventListener('design:updated', () => {
      setModificado(true)
    })
  }, [])

  // ── Obtener HTML y diseño del editor ────────────────────────────────────
  const obtenerDatosEditor = (): Promise<{ html: string; design: object }> => {
    return new Promise((resolve, reject) => {
      if (!editorRef.current) return reject(new Error('Editor no listo'))
      editorRef.current.exportHtml(({ html, design }) => {
        resolve({ html, design })
      })
    })
  }

  // ── Vista previa ────────────────────────────────────────────────────────
  const handleVistaPrevia = async () => {
    try {
      const { html } = await obtenerDatosEditor()
      setHtmlPrevia(html)
      setVistaPreviaAbierta(true)
    } catch {
      mostrar('error', 'Error al generar vista previa')
    }
  }

  // ── Exportar HTML ───────────────────────────────────────────────────────
  const handleExportarHtml = async () => {
    setExportando(true)
    try {
      const { html } = await obtenerDatosEditor()
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${nombrePlantilla.replace(/\s+/g, '_')}_${Date.now()}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      mostrar('success', 'HTML exportado correctamente')
    } catch {
      mostrar('error', 'Error al exportar HTML')
    } finally {
      setExportando(false)
    }
  }

  // ── Cargar plantilla en el editor ───────────────────────────────────────
  const handleCargarPlantilla = (plantilla: any) => {
    if (!editorRef.current) return

    try {
      if (plantilla.json_design) {
        const design = typeof plantilla.json_design === 'string'
          ? JSON.parse(plantilla.json_design)
          : plantilla.json_design
        editorRef.current.loadDesign(design)
      } else if (plantilla.html_content) {
        editorRef.current.loadDesign({ html: plantilla.html_content } as any)
      }
      setNombrePlantilla(plantilla.nombre)
      setAsunto(plantilla.asunto || '')
      setPlantillaId(plantilla.id)
      setModificado(false)
    } catch {
      mostrar('error', 'Error al cargar el diseño en el editor')
    }
  }

  // ── Nuevo diseño en blanco ───────────────────────────────────────────────
  const handleNuevo = () => {
    if (modificado && !confirm('¿Descartar los cambios no guardados?')) return
    editorRef.current?.loadDesign(DISENO_INICIAL as any)
    resetear()
    mostrar('info' as any, 'Nuevo diseño en blanco')
  }

  // ── Guardar rápido (Ctrl+S) ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (editorListo) setModalGuardarAbierto(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editorListo])

  const togglePanel = (panel: PanelLateral) => {
    setPanelAbierto(prev => prev === panel ? null : panel)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] -m-8 bg-background">

      {/* ── BARRA DE HERRAMIENTAS SUPERIOR ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-card shrink-0">
        {/* Nombre de la plantilla */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="text"
              value={nombrePlantilla}
              onChange={e => setNombrePlantilla(e.target.value)}
              className="text-sm font-semibold bg-transparent border-none outline-none text-foreground max-w-52 truncate"
              placeholder="Nombre de la plantilla"
            />
            {modificado && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0 shrink-0">
                <AlertCircle className="h-2.5 w-2.5" />
                Sin guardar
              </Badge>
            )}
          </div>
        </div>

        {/* Campo de asunto */}
        <div className="flex items-center gap-2 max-w-xs w-full">
          <span className="text-xs text-muted-foreground shrink-0">Asunto:</span>
          <input
            type="text"
            value={asunto}
            onChange={e => setAsunto(e.target.value)}
            placeholder="Escribe el asunto del email..."
            className={cn(
              'flex-1 h-8 px-2.5 rounded-lg border border-border bg-secondary/50 text-xs',
              'focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60'
            )}
          />
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0">
          {!editorListo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Cargando editor...
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleVistaPrevia}
            disabled={!editorListo}
            title="Vista previa (Ctrl+P)"
          >
            <Eye className="h-4 w-4" />
            Previsualizar
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportarHtml}
            disabled={!editorListo || exportando}
            title="Exportar HTML"
          >
            <Download className="h-4 w-4" />
            Exportar HTML
          </Button>

          <Button
            size="sm"
            onClick={() => setModalGuardarAbierto(true)}
            disabled={!editorListo}
            title="Guardar plantilla (Ctrl+S)"
          >
            <Save className="h-4 w-4" />
            {plantillaId ? 'Actualizar' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* ── CUERPO PRINCIPAL ── */}
      <div className="flex flex-1 min-h-0">

        {/* Panel lateral izquierdo */}
        <div className={cn(
          'border-r border-border/50 bg-card transition-all duration-300 flex',
          panelAbierto ? 'w-72' : 'w-12'
        )}>
          {/* Tabs de panel */}
          <div className="flex flex-col gap-1 p-1.5 border-r border-border/30">
            <button
              onClick={() => togglePanel('plantillas')}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                panelAbierto === 'plantillas'
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
              title="Plantillas guardadas"
            >
              <FileText className="h-4 w-4" />
            </button>
            <button
              onClick={() => togglePanel('variables')}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                panelAbierto === 'variables'
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
              title="Variables dinámicas"
            >
              <Braces className="h-4 w-4" />
            </button>
            <div className="flex-1" />
            <button
              onClick={handleNuevo}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="Nuevo diseño en blanco"
            >
              <Undo2 className="h-4 w-4" />
            </button>
          </div>

          {/* Contenido del panel */}
          {panelAbierto && (
            <div className="flex-1 min-w-0 overflow-hidden">
              {panelAbierto === 'plantillas' && (
                <PanelPlantillas
                  plantillaActivaId={plantillaId}
                  onCargar={handleCargarPlantilla}
                  onNueva={handleNuevo}
                />
              )}
              {panelAbierto === 'variables' && (
                <PanelVariables />
              )}
            </div>
          )}
        </div>

        {/* Editor Unlayer */}
        <div className="flex-1 min-w-0 relative">
          {!editorListo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 gap-4">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="text-center">
                <p className="font-medium">Cargando editor de email...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Unlayer se está inicializando
                </p>
              </div>
            </div>
          )}
          <EmailEditor
            ref={editorRef}
            onReady={onEditorListo}
            options={opcionesEditor}
            style={{ height: '100%', minHeight: '600px' }}
          />
        </div>
      </div>

      {/* ── MODALES ── */}
      <VistaPrevia
        open={vistaPreviaAbierta}
        onClose={() => setVistaPreviaAbierta(false)}
        html={htmlPrevia}
        asunto={asunto}
      />

      <ModalGuardarPlantilla
        open={modalGuardarAbierto}
        onClose={() => setModalGuardarAbierto(false)}
        plantillaId={plantillaId}
        nombreInicial={nombrePlantilla}
        obtenerDatosEditor={obtenerDatosEditor}
        asunto={asunto}
        onGuardada={(id, nombre) => {
          setPlantillaId(id)
          setNombrePlantilla(nombre)
          setModificado(false)
        }}
      />
    </div>
  )
}
