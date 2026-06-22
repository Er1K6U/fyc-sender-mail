import * as React from 'react'
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  tipo: ToastType
  titulo: string
  descripcion?: string
}

interface ToastContextValue {
  mostrar: (tipo: ToastType, titulo: string, descripcion?: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  const mostrar = React.useCallback((tipo: ToastType, titulo: string, descripcion?: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, tipo, titulo, descripcion }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }, [])

  const cerrar = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const iconos = {
    success: <CheckCircle2 className="h-5 w-5 text-green-400" />,
    error: <XCircle className="h-5 w-5 text-red-400" />,
    warning: <AlertCircle className="h-5 w-5 text-yellow-400" />,
    info: <Info className="h-5 w-5 text-blue-400" />,
  }

  const estilos = {
    success: 'border-green-500/30 bg-green-500/10',
    error: 'border-red-500/30 bg-red-500/10',
    warning: 'border-yellow-500/30 bg-yellow-500/10',
    info: 'border-blue-500/30 bg-blue-500/10',
  }

  return (
    <ToastContext.Provider value={{ mostrar }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl border backdrop-blur-sm shadow-lg',
              'animate-fade-in',
              estilos[toast.tipo]
            )}
          >
            <div className="mt-0.5 shrink-0">{iconos[toast.tipo]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{toast.titulo}</p>
              {toast.descripcion && (
                <p className="text-xs text-muted-foreground mt-0.5">{toast.descripcion}</p>
              )}
            </div>
            <button
              onClick={() => cerrar(toast.id)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider')
  return ctx
}
