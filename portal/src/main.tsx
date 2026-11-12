import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadViewerFromSwa, type ViewerState } from './viewer/loadViewer';
import './index.css';

// ローカル開発（npm run dev）ではログインがないため、デモ利用者を切り替えて確認する
const loadViewer = import.meta.env.DEV
  ? (): Promise<ViewerState> => Promise.resolve({ mode: 'demo' })
  : () => loadViewerFromSwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App loadViewer={loadViewer} />
  </StrictMode>,
);
