import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Mail,
  Users,
  FileText,
  Send,
  Settings,
  Server,
  LogOut,
  ChevronRight,
  Zap,
  BarChart2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/campanas', icon: Send, label: 'Campañas' },
  { to: '/reportes', icon: BarChart2, label: 'Reportes' },
  { to: '/contactos', icon: Users, label: 'Contactos' },
  { to: '/plantillas', icon: FileText, label: 'Plantillas' },
  { to: '/constructor', icon: Mail, label: 'Constructor' },
]

const configItems = [
  { to: '/smtp', icon: Server, label: 'Configuración SMTP', soloAdmin: true },
  { to: '/ajustes', icon: Settings, label: 'Ajustes', soloAdmin: false },
]

export default function Sidebar() {
  const { usuario, cerrarSesion } = useAuthStore()
  const navigate = useNavigate()
  const esAdmin = usuario?.rol === 'admin'
  const configVisibles = configItems.filter(item => esAdmin || !item.soloAdmin)

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      cerrarSesion()
      navigate('/login')
    }
  }

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col bg-card border-r border-border/50">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border/50">
        <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center shadow-lg shadow-primary/30">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-base gradient-brand-text">Email Builder</span>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Marketing Platform</p>
        </div>
      </div>

      {/* Navegación principal */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Principal
        </p>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group',
                isActive
                  ? 'bg-primary/15 text-primary glow-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight className="h-3 w-3 text-primary" />}
              </>
            )}
          </NavLink>
        ))}

        <div className="pt-4">
          <p className="px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Configuración
          </p>
          {configVisibles.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-4 w-4 shrink-0', isActive && 'text-primary')} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Usuario */}
      <div className="p-3 border-t border-border/50">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-white text-xs font-bold shrink-0">
            {usuario?.nombre?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{usuario?.nombre}</p>
            <p className="text-xs text-muted-foreground truncate">{usuario?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="text-muted-foreground hover:text-red-400 transition-colors p-1 rounded"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
