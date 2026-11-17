import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminPage from './AdminPage';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminPage />
  </StrictMode>,
);
