// Contacto tal como llega de la API (listado)
export interface Contacto {
  id: number
  nombre: string
  email: string
  empresa?: string
  email_valido: number
  suscrito: number
  fecha_unsub?: string
  created_at: string
  lista_nombre?: string
}

// Contacto para crear/editar en el modal
export interface ContactoForm {
  id?: number
  nombre: string
  email: string
  empresa?: string
  list_id?: number
}
