import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from '@/components/ui/toast'
import AppLayout from '@/components/layout/AppLayout'
import AppLayoutFullscreen from '@/components/layout/AppLayoutFullscreen'
import RutaProtegida from '@/components/layout/RutaProtegida'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import SmtpConfig from '@/pages/SmtpConfig'
import Contactos from '@/pages/Contactos'
import Plantillas from '@/pages/Plantillas'
import Constructor from '@/pages/Constructor'
import Campanas from '@/pages/Campanas'
import NuevaCampana from '@/pages/NuevaCampana'
import DetalleCampana from '@/pages/DetalleCampana'
import Reportes from '@/pages/Reportes'
import ReporteCampana from '@/pages/ReporteCampana'
import Ajustes from '@/pages/Ajustes'

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        {/* Ruta pública */}
        <Route path="/login" element={<Login />} />

        {/* Rutas protegidas — layout normal */}
        <Route element={<RutaProtegida />}>
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="/campanas" element={<Campanas />} />
            <Route path="/campanas/nueva" element={<NuevaCampana />} />
            <Route path="/campanas/:id" element={<DetalleCampana />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/reportes/campana/:id" element={<ReporteCampana />} />
            <Route path="/contactos" element={<Contactos />} />
            <Route path="/plantillas" element={<Plantillas />} />
            <Route path="/smtp" element={<SmtpConfig />} />
            <Route path="/ajustes" element={<Ajustes />} />
          </Route>

          {/* Constructor — layout fullscreen (sin padding interior) */}
          <Route element={<AppLayoutFullscreen />}>
            <Route path="/constructor" element={<Constructor />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}
