import {
  MailX, Inbox, ShieldAlert, Gauge, KeyRound, Clock, HelpCircle,
} from 'lucide-react'

/**
 * Metadatos de presentación de las categorías de error.
 * Deben coincidir con backend/src/services/errorSmtpService.js
 */
export interface MetaCategoria {
  label: string
  variante: 'destructive' | 'warning' | 'orange' | 'secondary'
  icon: typeof MailX
  /** true = no se reintenta nunca */
  permanente: boolean
}

export const CATEGORIAS_ERROR: Record<string, MetaCategoria> = {
  direccion_inexistente: {
    label: 'Dirección inexistente',
    variante: 'destructive',
    icon: MailX,
    permanente: true,
  },
  buzon_lleno: {
    label: 'Buzón lleno',
    variante: 'warning',
    icon: Inbox,
    permanente: false,
  },
  rechazado_spam: {
    label: 'Rechazado como spam',
    variante: 'orange',
    icon: ShieldAlert,
    permanente: true,
  },
  limite_proveedor: {
    label: 'Límite del proveedor',
    variante: 'orange',
    icon: Gauge,
    permanente: false,
  },
  error_autenticacion: {
    label: 'Error de autenticación',
    variante: 'destructive',
    icon: KeyRound,
    permanente: false,
  },
  error_temporal: {
    label: 'Error temporal',
    variante: 'warning',
    icon: Clock,
    permanente: false,
  },
  otro: {
    label: 'Otro error',
    variante: 'secondary',
    icon: HelpCircle,
    permanente: false,
  },
  sin_clasificar: {
    label: 'Sin clasificar',
    variante: 'secondary',
    icon: HelpCircle,
    permanente: false,
  },
}

export function metaCategoria(categoria?: string | null): MetaCategoria {
  return CATEGORIAS_ERROR[categoria || 'sin_clasificar'] ?? CATEGORIAS_ERROR.sin_clasificar
}
