export type Rol = 'admin' | 'editor'

export interface Usuario {
  id: number
  nombre: string
  email: string
  rol: Rol
  activo: number
  ultimo_login?: string | null
  created_at: string
}

export interface ThrottleConfig {
  emails_por_min: number
  emails_por_hora: number
  pausa_entre_lotes_ms: number
  jitter_pct: number
  warmup_activo: boolean
  // Pooling SMTP — conservador para evitar el error 454 de Gmail
  smtp_max_connections: number
  smtp_max_messages: number
  pausa_limite_base_min: number
}
