import { useEffect, useState, useCallback } from 'react'
import {
  Users, Plus, Upload, Search, Trash2, Edit2,
  ChevronLeft, ChevronRight, Filter, UserMinus,
  Layers, MoreHorizontal, CheckCircle2, XCircle, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { formatearFecha, formatearNumero, cn } from '@/lib/utils'
import ImportarWizard from '@/components/contactos/ImportarWizard'
import ContactoModal from '@/components/contactos/ContactoModal'
import ListaModal from '@/components/contactos/ListaModal'
import api from '@/lib/api'
import type { Contacto } from '@/types/contacto'

interface Lista {
  id: number
  nombre: string
  descripcion?: string
  total_contactos: number
  activos: number
}

interface Paginacion {
  total: number
  pagina: number
  por_pagina: number
  total_paginas: number
}

type EstadoFiltro = 'todos' | 'validos' | 'invalidos' | 'desuscritos'

export default function Contactos() {
  // ── Listas ──
  const [listas, setListas] = useState<Lista[]>([])
  const [listaActiva, setListaActiva] = useState<number | null>(null)
  const [modalLista, setModalLista] = useState<{ open: boolean; lista?: Lista | null }>({ open: false })

  // ── Contactos ──
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<EstadoFiltro>('todos')
  const [pagina, setPagina] = useState(1)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())

  // ── Modales ──
  const [modalImportar, setModalImportar] = useState(false)
  const [modalContacto, setModalContacto] = useState<{ open: boolean; contacto?: Contacto | null }>({ open: false })

  const { mostrar } = useToast()

  // ── Cargar listas ──
  const cargarListas = useCallback(async () => {
    try {
      const { data } = await api.get('/listas')
      setListas(data.listas)
      if (data.listas.length > 0 && !listaActiva) {
        setListaActiva(data.listas[0].id)
      }
    } catch {
      mostrar('error', 'Error al cargar listas')
    }
  }, [listaActiva])

  // ── Cargar contactos ──
  const cargarContactos = useCallback(async () => {
    if (!listaActiva) return
    setCargando(true)
    setSeleccionados(new Set())
    try {
      const { data } = await api.get('/contactos', {
        params: {
          list_id: listaActiva,
          q: busqueda || undefined,
          estado,
          pagina,
          por_pagina: 50,
        },
      })
      setContactos(data.contactos)
      setPaginacion(data.paginacion)
    } catch {
      mostrar('error', 'Error al cargar contactos')
    } finally {
      setCargando(false)
    }
  }, [listaActiva, busqueda, estado, pagina])

  useEffect(() => { cargarListas() }, [])
  useEffect(() => { cargarContactos() }, [cargarContactos])

  // Resetear página al cambiar filtros
  useEffect(() => { setPagina(1) }, [busqueda, estado, listaActiva])

  // ── Eliminar contacto ──
  const handleEliminar = async (id: number) => {
    if (!confirm('¿Eliminar este contacto?')) return
    try {
      await api.delete(`/contactos/${id}`)
      mostrar('success', 'Contacto eliminado')
      cargarContactos()
      cargarListas()
    } catch {
      mostrar('error', 'Error al eliminar')
    }
  }

  // ── Eliminar seleccionados ──
  const handleEliminarSeleccionados = async () => {
    if (seleccionados.size === 0) return
    if (!confirm(`¿Eliminar ${seleccionados.size} contacto(s)?`)) return
    try {
      await api.delete('/contactos', { data: { ids: Array.from(seleccionados) } })
      mostrar('success', `${seleccionados.size} contacto(s) eliminado(s)`)
      setSeleccionados(new Set())
      cargarContactos()
      cargarListas()
    } catch {
      mostrar('error', 'Error al eliminar')
    }
  }

  // ── Desuscribir ──
  const handleDesuscribir = async (id: number) => {
    if (!confirm('¿Desuscribir este contacto? No recibirá más emails de ninguna campaña.')) return
    try {
      await api.post(`/contactos/${id}/desuscribir`)
      mostrar('success', 'Contacto desuscrito')
      cargarContactos()
      cargarListas()
    } catch {
      mostrar('error', 'Error al desuscribir')
    }
  }

  // ── Eliminar lista ──
  const handleEliminarLista = async (lista: Lista) => {
    if (!confirm(`¿Eliminar la lista "${lista.nombre}" y todos sus ${lista.total_contactos} contactos?`)) return
    try {
      await api.delete(`/listas/${lista.id}`)
      mostrar('success', 'Lista eliminada')
      setListaActiva(null)
      cargarListas()
    } catch {
      mostrar('error', 'Error al eliminar la lista')
    }
  }

  const listaActivaObj = listas.find(l => l.id === listaActiva)

  const toggleSeleccion = (id: number) => {
    setSeleccionados(prev => {
      const nuevo = new Set(prev)
      nuevo.has(id) ? nuevo.delete(id) : nuevo.add(id)
      return nuevo
    })
  }

  const toggleTodos = () => {
    if (seleccionados.size === contactos.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(contactos.map(c => c.id)))
    }
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-4rem)] animate-fade-in">

      {/* ── SIDEBAR DE LISTAS ── */}
      <div className="w-64 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Listas</h2>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setModalLista({ open: true })}
            title="Nueva lista"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-1 overflow-y-auto flex-1">
          {listas.length === 0 ? (
            <div
              className="flex flex-col items-center py-8 text-center cursor-pointer rounded-xl border border-dashed border-border hover:border-primary/40 transition-colors"
              onClick={() => setModalLista({ open: true })}
            >
              <Layers className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Sin listas aún</p>
              <p className="text-xs text-primary mt-1">+ Crear primera lista</p>
            </div>
          ) : (
            listas.map(lista => (
              <div
                key={lista.id}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all',
                  listaActiva === lista.id
                    ? 'bg-primary/15 text-primary'
                    : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setListaActiva(lista.id)}
              >
                <div className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  listaActiva === lista.id ? 'bg-primary' : 'bg-muted-foreground/30'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{lista.nombre}</p>
                  <p className="text-xs opacity-60">
                    {formatearNumero(lista.activos)} activos
                  </p>
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); setModalLista({ open: true, lista }) }}
                    className="p-1 hover:text-primary"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleEliminarLista(lista) }}
                    className="p-1 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stats de lista activa */}
        {listaActivaObj && (
          <Card>
            <CardContent className="py-3 px-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {listaActivaObj.nombre}
              </p>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold">{formatearNumero(listaActivaObj.total_contactos)}</p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-green-400">{formatearNumero(listaActivaObj.activos)}</p>
                  <p className="text-[10px] text-muted-foreground">Activos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── ÁREA PRINCIPAL DE CONTACTOS ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nombre, email o empresa..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className={cn(
                  'w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-secondary/50 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60'
                )}
              />
            </div>

            <Select value={estado} onValueChange={v => setEstado(v as EstadoFiltro)}>
              <SelectTrigger className="w-40 h-10">
                <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="validos">✅ Válidos</SelectItem>
                <SelectItem value="invalidos">❌ Inválidos</SelectItem>
                <SelectItem value="desuscritos">🚫 Desuscritos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            {seleccionados.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleEliminarSeleccionados}>
                <Trash2 className="h-4 w-4" />
                Eliminar ({seleccionados.size})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalImportar(true)}
              disabled={listas.length === 0}
            >
              <Upload className="h-4 w-4" />
              Importar CSV/Excel
            </Button>
            <Button
              size="sm"
              onClick={() => setModalContacto({ open: true })}
              disabled={listas.length === 0}
            >
              <Plus className="h-4 w-4" />
              Agregar contacto
            </Button>
          </div>
        </div>

        {/* Sin lista seleccionada */}
        {!listaActiva ? (
          <Card className="flex-1 border-dashed">
            <CardContent className="flex flex-col items-center justify-center h-full py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="font-medium text-muted-foreground">Selecciona una lista</p>
              <p className="text-sm text-muted-foreground/70 mt-1">o crea tu primera lista en el panel izquierdo</p>
            </CardContent>
          </Card>
        ) : (
          /* ── TABLA DE CONTACTOS ── */
          <Card className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-auto">
              {cargando ? (
                <div className="flex items-center justify-center h-48">
                  <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
                </div>
              ) : contactos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/20 mb-3" />
                  <p className="text-muted-foreground font-medium">
                    {busqueda ? `Sin resultados para "${busqueda}"` : 'Esta lista está vacía'}
                  </p>
                  {!busqueda && (
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" variant="outline" onClick={() => setModalImportar(true)}>
                        <Upload className="h-3.5 w-3.5" /> Importar CSV
                      </Button>
                      <Button size="sm" onClick={() => setModalContacto({ open: true })}>
                        <Plus className="h-3.5 w-3.5" /> Agregar uno
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={seleccionados.size === contactos.length && contactos.length > 0}
                          onChange={toggleTodos}
                          className="w-4 h-4 accent-primary"
                        />
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Empresa</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Agregado</th>
                      <th className="w-24 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {contactos.map(contacto => (
                      <tr
                        key={contacto.id}
                        className={cn(
                          'group hover:bg-secondary/30 transition-colors',
                          seleccionados.has(contacto.id) && 'bg-primary/5'
                        )}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={seleccionados.has(contacto.id)}
                            onChange={() => toggleSeleccion(contacto.id)}
                            className="w-4 h-4 accent-primary"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-medium shrink-0">
                              {contacto.nombre.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium">{contacto.nombre}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{contacto.email}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {contacto.empresa || <span className="italic opacity-40">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {!contacto.email_valido ? (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3" /> Inválido
                            </Badge>
                          ) : !contacto.suscrito ? (
                            <Badge variant="orange">
                              <UserMinus className="h-3 w-3" /> Desuscrito
                            </Badge>
                          ) : (
                            <Badge variant="success">
                              <CheckCircle2 className="h-3 w-3" /> Activo
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatearFecha(contacto.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setModalContacto({ open: true, contacto })}
                              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            {contacto.suscrito === 1 && (
                              <button
                                onClick={() => handleDesuscribir(contacto.id)}
                                className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-orange-400 transition-colors"
                                title="Desuscribir"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleEliminar(contacto.id)}
                              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-red-400 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Paginación */}
            {paginacion && paginacion.total_paginas > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 shrink-0">
                <p className="text-xs text-muted-foreground">
                  {formatearNumero((pagina - 1) * paginacion.por_pagina + 1)}–
                  {formatearNumero(Math.min(pagina * paginacion.por_pagina, paginacion.total))} de{' '}
                  {formatearNumero(paginacion.total)} contactos
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={pagina === 1}
                    onClick={() => setPagina(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: Math.min(5, paginacion.total_paginas) }, (_, i) => {
                    const p = Math.max(1, Math.min(pagina - 2, paginacion.total_paginas - 4)) + i
                    return (
                      <button
                        key={p}
                        onClick={() => setPagina(p)}
                        className={cn(
                          'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                          p === pagina
                            ? 'gradient-brand text-white'
                            : 'hover:bg-secondary text-muted-foreground'
                        )}
                      >
                        {p}
                      </button>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={pagina === paginacion.total_paginas}
                    onClick={() => setPagina(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* ── MODALES ── */}
      <ImportarWizard
        open={modalImportar}
        onClose={() => setModalImportar(false)}
        listas={listas}
        listaSeleccionada={listaActiva || undefined}
        onImportacionCompletada={() => { cargarContactos(); cargarListas() }}
      />

      <ContactoModal
        open={modalContacto.open}
        onClose={() => setModalContacto({ open: false })}
        listas={listas}
        listaSeleccionada={listaActiva || undefined}
        contacto={modalContacto.contacto}
        onGuardado={() => { cargarContactos(); cargarListas() }}
      />

      <ListaModal
        open={modalLista.open}
        onClose={() => setModalLista({ open: false })}
        lista={modalLista.lista}
        onGuardada={nuevaLista => {
          cargarListas()
          if (!listaActiva && nuevaLista?.id) setListaActiva(nuevaLista.id)
        }}
      />
    </div>
  )
}
