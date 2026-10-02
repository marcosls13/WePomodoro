import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Buscamos el <div id="root"> de tu index.html e inyectamos React ahí
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
