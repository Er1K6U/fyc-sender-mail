export interface EventoAuditoria {
  id: number
  evento: string
  evento_label: string
  campaign_id: number | null
  campaign_nombre: string | null
  user_id: number | null
  user_nombre: string | null
  user_email: string | null
  smtp_config_id: number | null
  smtp_nombre: string | null
  smtp_from_email: string | null
  enviados: number
  fallidos: number
  total_envios: number
  detalle: any
  ip: string | null
  created_at: string
  campana_eliminada: boolean
  campana_inexistente: boolean
}

export interface PuntoSerie {
  periodo: string
  enviados: number
  campanas: number
  cuentas_smtp: number
}

export interface ResumenAuditoria {
  rango: { desde: string; hasta: string; agrupacion: 'dia' | 'mes' }
  serie: PuntoSerie[]
  totales: {
    enviados: number
    fallidos: number
    rebotados: number
    campanas_implicadas: number
    campanas_eliminadas: number
  }
}

export interface CuentaSmtpAuditoria {
  smtp_config_id: number | null
  smtp_nombre: string
  from_email: string | null
  limite_dia: number
  enviados_periodo: number
  fallidos_periodo: number
  campanas: number
  enviados_hoy_contador: number
  enviados_hoy_real: number
  descuadre_hoy: number
}
