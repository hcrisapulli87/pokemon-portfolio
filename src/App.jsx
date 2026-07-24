import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Nav from './components/Nav'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Collection from './pages/Collection'
import Graded from './pages/Graded'
import MasterSets from './pages/MasterSets'
import SetDetail from './pages/SetDetail'
import Settings from './pages/Settings'

function Layout() {
  return (
    <div className="md:flex">
      <Nav />
      <main className="flex-1 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">
        <Outlet />
      </main>
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
