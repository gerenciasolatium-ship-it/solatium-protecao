import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Lojas from './pages/Lojas';
import Vendedores from './pages/Vendedores';
import Planos from './pages/Planos';
import Modelos from './pages/Modelos';
import Clientes from './pages/Clientes';
import Sinistros from './pages/Sinistros';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/lojas" element={<Lojas />} />
          <Route path="/vendedores" element={<Vendedores />} />
          <Route path="/planos" element={<Planos />} />
          <Route path="/modelos" element={<Modelos />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/sinistros" element={<Sinistros />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
