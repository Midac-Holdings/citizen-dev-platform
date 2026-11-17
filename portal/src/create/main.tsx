import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CreatePage from './CreatePage';
import '../index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CreatePage />
  </StrictMode>,
);
