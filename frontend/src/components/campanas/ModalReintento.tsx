import { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatearNumero } from '@/lib/utils'
import { metaCategoria } from '@/lib/erroresSmtp'
import api from '@/lib/api'

interface Preview {
  total_reintentables: number
  desglose: { categoria: string; estado: string; total: number }[]
  excluidos: {
    ya_enviados: number
    error_permanente: number
    desuscritos: number
    direcciones_invalidas: number
  }
}

interface Props {
  open: boolean
  campaignId: number
  onClose: () => void
  onReintentado: () => void
}

export default function ModalReintento({ open, campaignId, onClose, onReintentado }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const { mostrar } = useToast()

  useEffect(() => {
    if (!open) return
    setCargando(true)
    setPreview(null)
    api.get(`/campanas/${campaignId}/reintento`)
      .then(({ data }) => setPreview(data))
      .catch(err => mostrar('error', 'Error', err.response?.data?.error))
      .finally(() => setCargando(false))
  }, [open, campaignId])

  const confirmar = async () => {
    setEnviando(true)
    try {
      const { data } = await api.post(`/campanas/${campaignId}/reintentar`)
      mostrar('success', 'Reenvío iniciado', data.mensaje)
      onReintentado()
      onClose()
    } catch (err: any) {
      mostrar('error', 'No se pudo reintentar', err.response?.data?.error)
    } finally {
      setEnviando(false)
    }
  }

  const excluidos = preview?.excluidos
  const totalExcluidos = excluidos
    ? excluidos.ya_enviados + excluidos.error_permanente +
      excluidos.desuscritos + excluidos.direcciones_invalidas
    : 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl gradient-brand flex items-center justify-center shadow-lg shadow-primary/30">
              <RefreshCw className="h-4 w-4 text-white" />
            </div>
            <div>
              <DialogTitle>Reenviar a los no entregados</DialogTitle>
              <DialogDescription>
                Revisa el desglose antes de confirmar.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {cargando ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Calculando...
            </div>
          ) : !preview ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No se pudo cargar la información.
            </p>
          ) : (
            <>
              {/* Garantía anti-duplicados */}
              <div className="flex items-start gap-2 rounded-lg bg-green-500/5 border border-green-500/20 p-3">
                <ShieldCheck className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Los <strong>{formatearNumero(excluidos?.ya_enviados ?? 0)}</strong> correos ya
                  entregados <strong>no se repiten</strong>. El sistema solo reencola envíos
                  fallidos o pendientes.
                </p>
              </div>

              <div className="text-center py-2">
                <p className="text-3xl font-bold text-primary">
                  {formatearNumero(preview.total_reintentables)}
                </p>
                <p className="text-sm text-muted-foreground">
                  destinatario(s) se reenviarían
                </p>
              </div>

              {preview.desglose.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Motivo del fallo</p>
                  {preview.desglose.map((d, i) => {
                    const meta = metaCategoria(d.categoria)
                    const Icono = meta.icon
                    return (
                      <div key={`${d.categoria}-${d.estado}-${i}`}
                           className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 min-w-0">
                          <Icono className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {d.estado === 'pendiente' ? 'Nunca llegó a enviarse' : meta.label}
                          </span>
                        </span>
                        <span className="font-medium tabular-nums shrink-0">
                          {formatearNumero(d.total)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {totalExcluidos > 0 && (
                <div className="border-t border-border/50 pt-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Se excluyen ({formatearNumero(totalExcluidos)})
                  </p>
                  {[
                    ['Ya entregados', excluidos!.ya_enviados],
                    ['Fallo permanente', excluidos!.error_permanente],
                    ['Desuscritos', excluidos!.desuscritos],
                    ['Direcciones inválidas', excluidos!.direcciones_invalidas],
                  ].filter(([, n]) => (n as number) > 0).map(([label, n]) => (
                    <div key={label as string} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{label as string}</span>
                      <span className="tabular-nums">{formatearNumero(n as number)}</span>
                    </div>
                  ))}
                </div>
              )}

              {preview.total_reintentables === 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-orange-500/5 border border-orange-500/20 p-3">
                  <AlertCircle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    No queda nada que reintentar. Los fallos restantes son permanentes o
                    corresponden a contactos desuscritos o con dirección inválida.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                El reenvío respeta los límites de velocidad configurados en Ajustes.
              </p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={confirmar}
            loading={enviando}
            disabled={cargando || !preview || preview.total_reintentables === 0}
          >
            <RefreshCw className="h-4 w-4" />
            Reenviar {preview ? formatearNumero(preview.total_reintentables) : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
