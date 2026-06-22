import { useState } from 'react'
import { Monitor, Smartphone, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  html: string
  asunto?: string
  fromNombre?: string
}

type Dispositivo = 'desktop' | 'mobile'

const ANCHOS: Record<Dispositivo, string> = {
  desktop: '100%',
  mobile: '375px',
}

export default function VistaPrevia({ open, onClose, html, asunto, fromNombre }: Props) {
  const [dispositivo, setDispositivo] = useState<Dispositivo>('desktop')
  const [zoom, setZoom] = useState(100)

  const htmlFinal = html
    .replace(/\{\{nombre\}\}/g, 'María García')
    .replace(/\{\{empresa\}\}/g, 'Empresa Ejemplo S.A.')
    .replace(/\{\{email\}\}/g, 'maria@ejemplo.com')
    .replace(/\{\{fecha\}\}/g, new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        size="xl"
        className="max-w-6xl w-[95vw] max-h-[95vh] p-0 flex flex-col gap-0"
      >
        {/* Barra superior */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div className="ml-3 flex items-center gap-1 bg-secondary/80 rounded-lg px-3 py-1.5 text-xs text-muted-foreground max-w-xs truncate">
              <span className="opacity-60">Asunto:</span>
              <span className="text-foreground font-medium truncate">{asunto || '(sin asunto)'}</span>
            </div>
          </div>

          {/* Controles de dispositivo */}
          <div className="flex items-center gap-3">
            {/* Toggle desktop/mobile */}
            <div className="flex items-center bg-secondary rounded-lg p-1 gap-1">
              <button
                onClick={() => setDispositivo('desktop')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  dispositivo === 'desktop'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Monitor className="h-3.5 w-3.5" />
                Desktop
              </button>
              <button
                onClick={() => setDispositivo('mobile')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  dispositivo === 'mobile'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Smartphone className="h-3.5 w-3.5" />
                Mobile
              </button>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
              <button
                onClick={() => setZoom(z => Math.max(50, z - 10))}
                className="p-1.5 rounded-md hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-muted-foreground w-10 text-center">{zoom}%</span>
              <button
                onClick={() => setZoom(z => Math.min(150, z + 10))}
                className="p-1.5 rounded-md hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setZoom(100)}
                className="p-1.5 rounded-md hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                title="Restablecer zoom"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Simulador de cliente de email */}
        {fromNombre && (
          <div className="px-5 py-2.5 border-b border-border/30 bg-secondary/30 shrink-0">
            <div className="max-w-2xl space-y-1 text-xs text-muted-foreground">
              <div className="flex gap-2">
                <span className="w-12 text-right shrink-0">De:</span>
                <span className="text-foreground font-medium">{fromNombre}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-12 text-right shrink-0">Para:</span>
                <span>María García &lt;maria@ejemplo.com&gt;</span>
              </div>
              <div className="flex gap-2">
                <span className="w-12 text-right shrink-0">Asunto:</span>
                <span className="text-foreground font-medium">{asunto || '(sin asunto)'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Área de previsualización */}
        <div className="flex-1 overflow-auto bg-zinc-900/50 flex items-start justify-center p-6 min-h-0">
          <div
            className={cn(
              'transition-all duration-300 ease-in-out',
              dispositivo === 'mobile' && 'shadow-2xl rounded-[2rem] overflow-hidden border-4 border-zinc-700'
            )}
            style={{
              width: ANCHOS[dispositivo],
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
            }}
          >
            {dispositivo === 'mobile' && (
              <div className="bg-zinc-800 h-7 flex items-center justify-center">
                <div className="w-20 h-1.5 bg-zinc-600 rounded-full" />
              </div>
            )}
            <iframe
              srcDoc={`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>${htmlFinal}</body>
</html>`}
              className="w-full border-0 bg-white"
              style={{ minHeight: '600px', height: '100%' }}
              sandbox="allow-same-origin"
              onLoad={e => {
                const iframe = e.currentTarget
                const body = iframe.contentDocument?.body
                if (body) {
                  iframe.style.height = `${body.scrollHeight + 32}px`
                }
              }}
              title="Vista previa del email"
            />
            {dispositivo === 'mobile' && (
              <div className="bg-zinc-800 h-6 flex items-center justify-center">
                <div className="w-8 h-1.5 bg-zinc-600 rounded-full" />
              </div>
            )}
          </div>
        </div>

        {/* Nota sobre variables */}
        <div className="px-5 py-2.5 border-t border-border/30 bg-secondary/20 shrink-0">
          <p className="text-xs text-muted-foreground text-center">
            Las variables <code className="bg-card px-1 rounded text-primary">{'{{nombre}}'}</code>,{' '}
            <code className="bg-card px-1 rounded text-primary">{'{{empresa}}'}</code> etc.
            se muestran con datos de ejemplo. Se reemplazarán con los datos reales de cada contacto al enviar.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
