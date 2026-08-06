import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'

type EventMap = Record<string, (...args: any[]) => void>

let socketSingleton: Socket | null = null

// En desarrollo el frontend corre en Vite (:5173+) y el backend en :3001 — son orígenes distintos.
// En producción ambos sirven desde el mismo origen, se usa URL relativa.
const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin

function getSocket(): Socket {
  if (!socketSingleton) {
    socketSingleton = io(SOCKET_URL, {
      // ORDEN IMPORTANTE: primero long-polling, luego mejora a WebSocket.
      //
      // Estaba al revés ('websocket' primero), que es justo lo que rompe detrás
      // de un proxy: si Nginx no reenvía las cabeceras Upgrade/Connection, el
      // handshake de WebSocket falla o se queda colgado y la conexión nunca se
      // establece. El long-polling es HTTP corriente y atraviesa cualquier
      // proxy; Socket.io mejora a WebSocket solo si el entorno lo permite.
      transports: ['polling', 'websocket'],
      upgrade: true,
      autoConnect: true,
      reconnection: true,
      // Sin tope de reintentos: antes se rendía a los 10 y ya no volvía nunca,
      // aunque el servidor se recuperara.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 20000,
    })

    socketSingleton.on('connect', () => {
      console.log('[Socket.io] Conectado:', socketSingleton?.id,
        '· transporte:', socketSingleton?.io?.engine?.transport?.name)
      notificarEstado(true)
    })
    socketSingleton.on('disconnect', (reason) => {
      console.log('[Socket.io] Desconectado:', reason)
      notificarEstado(false)
    })
    socketSingleton.on('connect_error', (err) => {
      console.warn('[Socket.io] Error de conexión:', err.message)
      notificarEstado(false)
    })
  }
  return socketSingleton
}

// ── Estado de conexión compartido ────────────────────────────────────────────
// Permite que la interfaz avise cuando no hay tiempo real y active el respaldo
// por sondeo, en vez de quedarse en silencio mostrando datos congelados.
const suscriptoresEstado = new Set<(conectado: boolean) => void>()

function notificarEstado(conectado: boolean) {
  suscriptoresEstado.forEach(fn => fn(conectado))
}

export function useEstadoSocket(): boolean {
  const [conectado, setConectado] = useState(() => getSocket().connected)

  useEffect(() => {
    const socket = getSocket()
    setConectado(socket.connected)
    suscriptoresEstado.add(setConectado)
    return () => { suscriptoresEstado.delete(setConectado) }
  }, [])

  return conectado
}

/**
 * Hook para unirse a la sala de una campaña y escuchar sus eventos en tiempo real.
 */
export function useCampaignSocket(
  campaignId: number | null,
  handlers: EventMap
) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const socket = getSocket()

  useEffect(() => {
    if (!campaignId) return

    const room = `campaign:${campaignId}`
    socket.emit('campaign:join', campaignId)

    const eventNames = [
      'campaign:progress',
      'campaign:send_update',
      'campaign:completed',
      'campaign:error',
      'campaign:paused',
      'campaign:log',
      'campaign:telemetry',
    ]

    const wrappers: Record<string, (...args: any[]) => void> = {}
    for (const evt of eventNames) {
      wrappers[evt] = (...args: any[]) => handlersRef.current[evt]?.(...args)
      socket.on(evt, wrappers[evt])
    }

    return () => {
      socket.emit('campaign:leave', campaignId)
      for (const evt of eventNames) {
        socket.off(evt, wrappers[evt])
      }
    }
  }, [campaignId])

  const emit = useCallback((event: string, data?: any) => {
    socket.emit(event, data)
  }, [])

  return { socket, emit, connected: socket.connected }
}
