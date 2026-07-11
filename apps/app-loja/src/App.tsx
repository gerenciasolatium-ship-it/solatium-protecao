import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Clientes } from './pages/Clientes';
import { NovoCliente } from './pages/NovoCliente';
import { NovaProtecao } from './pages/NovaProtecao';
import { ValidarCertificado } from './pages/ValidarCertificado';
import { VistoriaRemota } from './pages/VistoriaRemota';
import { Sinistros } from './pages/Sinistros';
import { ResgatarVoucher } from './pages/ResgatarVoucher';
import { MinhasVendas } from './pages/MinhasVendas';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Pública: aberta pelo QR code do bilhete (sem login). */}
      <Route path="/validar/:codigo" element={<ValidarCertificado />} />
      {/* Pública: vistoria remota aberta pelo cliente via link do WhatsApp. */}
      <Route path="/vistoria/:token" element={<VistoriaRemota />} />
      <Route
        path="/protecao/nova"
        element={
          <ProtectedRoute>
            <NovaProtecao />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clientes"
        element={
          <ProtectedRoute>
            <Clientes />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clientes/novo"
        element={
          <ProtectedRoute>
            <NovoCliente />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sinistros"
        element={
          <ProtectedRoute>
            <Sinistros />
          </ProtectedRoute>
        }
      />
      <Route
        path="/voucher"
        element={
          <ProtectedRoute>
            <ResgatarVoucher />
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendas"
        element={
          <ProtectedRoute>
            <MinhasVendas />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
