import { useState } from 'react'
import { Users, Send, UserCog } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import UsuariosTab from '@/components/ajustes/UsuariosTab'
import EnvioTab from '@/components/ajustes/EnvioTab'
import MiCuentaTab from '@/components/ajustes/MiCuentaTab'

type TabId = 'usuarios' | 'envio' | 'cuenta'

interface Tab {
  id: TabId
  label: string
  icon: typeof Users
  soloAdmin: boolean
}

const TABS: Tab[] = [
  { id: 'usuarios', label: 'Usuarios', icon: Users, soloAdmin: true },
  { id: 'envio', label: 'Envío y entregabilidad', icon: Send, soloAdmin: true },
  { id: 'cuenta', label: 'Mi cuenta', icon: UserCog, soloAdmin: false },
]

export default function Ajustes() {
  const { usuario } = useAuthStore()
  const esAdmin = usuario?.rol === 'admin'
  const tabsVisibles = TABS.filter(t => esAdmin || !t.soloAdmin)
  const [tab, setTab] = useState<TabId>(tabsVisibles[0].id)

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Ajustes</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Administra usuarios, la configuración global de envío y tu cuenta.
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-border/50">
        {tabsVisibles.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div>
        {tab === 'usuarios' && esAdmin && <UsuariosTab />}
        {tab === 'envio' && esAdmin && <EnvioTab />}
        {tab === 'cuenta' && <MiCuentaTab />}
      </div>
    </div>
  )
}
