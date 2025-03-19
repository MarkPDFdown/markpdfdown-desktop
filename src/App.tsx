import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './App.css'
import AppLayout from './components/Layout'
import Home from './pages/Home'
import List from './pages/List'
import Settings from './pages/Settings'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="list" element={<List />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
