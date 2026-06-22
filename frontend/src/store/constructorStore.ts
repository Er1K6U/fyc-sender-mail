import { create } from 'zustand'

interface PlantillaGuardada {
  id: number
  nombre: string
  descripcion?: string
  asunto: string
  thumbnail_url?: string
  created_at: string
}

interface ConstructorState {
  // Estado del editor
  asunto: string
  nombrePlantilla: string
  plantillaId: number | null
  modificado: boolean

  // Acciones
  setAsunto: (asunto: string) => void
  setNombrePlantilla: (nombre: string) => void
  setPlantillaId: (id: number | null) => void
  setModificado: (v: boolean) => void
  resetear: () => void
}

export const useConstructorStore = create<ConstructorState>((set) => ({
  asunto: '',
  nombrePlantilla: 'Nueva plantilla',
  plantillaId: null,
  modificado: false,

  setAsunto: (asunto) => set({ asunto, modificado: true }),
  setNombrePlantilla: (nombrePlantilla) => set({ nombrePlantilla }),
  setPlantillaId: (plantillaId) => set({ plantillaId, modificado: false }),
  setModificado: (modificado) => set({ modificado }),
  resetear: () => set({
    asunto: '',
    nombrePlantilla: 'Nueva plantilla',
    plantillaId: null,
    modificado: false,
  }),
}))
