import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { DemoBanner, Footer, Loading, ToastProvider } from './components/ui.tsx';
import { HomePage, NotFoundPage } from './pages/public/Home.tsx';
import { InscriptionPage } from './pages/public/Inscription.tsx';
import { ReinscriptionPage } from './pages/public/Reinscription.tsx';
import { PrivacyPage } from './pages/public/Privacy.tsx';

const BureauApp = lazy(() => import('./pages/bureau/BureauApp.tsx'));

export function App() {
  return (
    <ToastProvider>
      <a className="skip" href="#contenu">Aller au contenu</a>
      <DemoBanner />
      <Routes>
        <Route path="/" element={<><HomePage /><Footer /></>} />
        <Route path="/inscription" element={<><InscriptionPage /><Footer /></>} />
        <Route path="/reinscription/:token" element={<><ReinscriptionPage /><Footer /></>} />
        <Route path="/donnees-personnelles" element={<><PrivacyPage /><Footer /></>} />
        <Route path="/bureau/*" element={<Suspense fallback={<Loading />}><BureauApp /></Suspense>} />
        <Route path="*" element={<><NotFoundPage /><Footer /></>} />
      </Routes>
    </ToastProvider>
  );
}
