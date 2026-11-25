import { Route, Routes } from 'react-router';

import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';

function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <h1 className="text-2xl font-bold text-slate-900">Zizo LMS</h1>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Paths must match the links in the reset email (`buildResetUrl`) and the pages. */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* Every other path keeps rendering the placeholder home, as before routing existed. */}
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
