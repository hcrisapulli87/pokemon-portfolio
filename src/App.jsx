import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import BottomNav from './components/BottomNav'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Collection from './pages/Collection'
import Graded from './pages/Graded'
import MasterSets from './pages/MasterSets'
import SetDetail from './pages/SetDetail'
import Settings from './pages/Settings'

// Mobile-first: one centered ~460px column at every width, with the floating
// liquid-glass nav (BottomNav) pinned to the bottom of the viewport.
function Layout() {
  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[460px] bg-vault-bg">
      <main className="px-[18px] pt-[calc(18px+env(safe-area-inset-top))] pb-[128px]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/graded" element={<Graded />} />
              <Route path="/sets" element={<MasterSets />} />
              <Route path="/sets/:setId" element={<SetDetail />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
