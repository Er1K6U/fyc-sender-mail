import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

type EventMap = Record<string, (...args: any[]) => void>

let socketSingleton: Socket | null = null

// En desarrollo el frontend corre en Vite (:5173+) y el backend en :3001 — son orígenes distintos.
// En producción ambos sirven desde el mismo origen, se usa URL relativa.
const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin

function getSocket(): Socket {
  if (!socketSingleton) {
    socketSingleton = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    })
    socketSingleton.on('connect', () =>
      console.log('[Socket.io] Conectado:', socketSingleton?.id)
    )
    socketSingleton.on('disconnect', (reason) =>
      console.log('[Socket.io] Desconectado:', reason)
    )
  }
  return socketSingleton
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
