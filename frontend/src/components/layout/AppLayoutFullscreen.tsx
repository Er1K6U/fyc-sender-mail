import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

// Layout sin padding interior — ideal para el constructor visual que necesita 100% de altura
export default function AppLayoutFullscreen() {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
