import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './components/ThemeProvider';
import App from './App';

import '@radix-ui/themes/styles.css';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
