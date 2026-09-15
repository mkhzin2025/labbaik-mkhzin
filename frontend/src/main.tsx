import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const initialTheme = (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
document.documentElement.dataset.theme = initialTheme;
document.documentElement.setAttribute('data-theme', initialTheme);
document.documentElement.classList.toggle('dark', initialTheme === 'dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

