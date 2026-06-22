import { useState } from 'react'
import { Copy, CheckCheck, Braces } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Variable {
  tag: string
  label: string
  descripcion: string
  ejemplo: string
  categoria: string
}

const VARIABLES: Variable[] = [
  // Contacto
  { tag: '{{nombre}}', label: 'Nombre', descripcion: 'Nombre del contacto', ejemplo: 'María García', categoria: 'Contacto' },
  { tag: '{{email}}', label: 'Email', descripcion: 'Dirección de email del contacto', ejemplo: 'maria@empresa.com', categoria: 'Contacto' },
  { tag: '{{empresa}}', label: 'Empresa', descripcion: 'Empresa del contacto', ejemplo: 'Acme Corp S.A.', categoria: 'Contacto' },
  // Fecha y hora
  { tag: '{{fecha}}', label: 'Fecha actual', descripcion: 'Fecha del día del envío', ejemplo: '15 de enero de 2025', categoria: 'Fecha' },
  { tag: '{{año}}', label: 'Año actual', descripcion: 'Año del envío', ejemplo: '2025', categoria: 'Fecha' },
  { tag: '{{mes}}', label: 'Mes actual', descripcion: 'Mes del envío', ejemplo: 'enero', categoria: 'Fecha' },
  // Campaña
  { tag: '{{asunto}}', label: 'Asunto', descripcion: 'Asunto de la campaña', ejemplo: 'Oferta especial para ti', categoria: 'Campaña' },
  { tag: '{{from_nombre}}', label: 'Remitente', descripcion: 'Nombre del remitente', ejemplo: 'Equipo de Ventas', categoria: 'Campaña' },
  // Links especiales
  { tag: '{{link_unsub}}', label: 'Desuscribirse', descripcion: 'Link para cancelar suscripción (obligatorio)', ejemplo: 'https://...', categoria: 'Links' },
  { tag: '{{link_ver_online}}', label: 'Ver en navegador', descripcion: 'Link para ver el email en el navegador', ejemplo: 'https://...', categoria: 'Links' },
]

interface Props {
  onInsertar?: (tag: string) => void
}

export default function PanelVariables({ onInsertar }: Props) {
  const [copiado, setCopiado] = useState<string | null>(null)

  const copiar = async (tag: string) => {
    await navigator.clipboard.writeText(tag)
    setCopiado(tag)
    setTimeout(() => setCopiado(null), 2000)
    onInsertar?.(tag)
  }

  const categorias = [...new Set(VARIABLES.map(v => v.categoria))]

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Braces className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Variables dinámicas</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          Haz click en una variable para copiarla. Pégala en cualquier campo de texto del editor.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {categorias.map(categoria => (
          <div key={categoria}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              {categoria}
            </p>
            <div className="space-y-1">
              {VARIABLES.filter(v => v.categoria === categoria).map(variable => (
                <button
                  key={variable.tag}
                  onClick={() => copiar(variable.tag)}
                  className={cn(
                    'w-full text-left rounded-lg border p-2.5 transition-all duration-150 group',
                    'hover:border-primary/40 hover:bg-primary/5',
                    copiado === variable.tag
                      ? 'border-green-500/40 bg-green-500/10'
                      : 'border-border/50 bg-card/50'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <code className={cn(
                          'text-[11px] font-mono font-bold',
                          copiado === variable.tag ? 'text-green-400' : 'text-primary'
                        )}>
                          {variable.tag}
                        </code>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {variable.descripcion}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate italic">
                        Ej: {variable.ejemplo}
                      </p>
                    </div>
                    <div className={cn(
                      'shrink-0 p-1 rounded transition-colors',
                      copiado === variable.tag
                        ? 'text-green-400'
                        : 'text-muted-foreground/40 group-hover:text-primary'
                    )}>
                      {copiado === variable.tag
                        ? <CheckCheck className="h-3 w-3" />
                        : <Copy className="h-3 w-3" />}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Nota de uso */}
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            <span className="text-primary font-semibold">Consejo:</span> En Unlayer, haz doble click
            en un bloque de texto → escribe o pega la variable. Se reemplazará automáticamente
            por los datos reales de cada contacto al momento del envío.
          </p>
        </div>
      </div>
    </div>
  )
}
