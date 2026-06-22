import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatearFecha(fecha: string | Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(fecha))
}

export function formatearNumero(n: number): string {
  return new Intl.NumberFormat('es-ES').format(n)
}

export function formatearPorcentaje(valor: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((valor / total) * 100)}%`
}

export function truncar(texto: string, max = 50): string {
  return texto.length > max ? `${texto.slice(0, max)}…` : texto
}
