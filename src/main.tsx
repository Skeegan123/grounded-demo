import { createRoot } from 'react-dom/client'
import './index.css'
import { createGroundedApp } from './application/createGroundedApp.tsx'

createRoot(document.getElementById('root')!).render(createGroundedApp())
