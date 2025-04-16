import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import './App.css'
import AppLayout from './components/Layout'
import Home from './pages/Home'
import List from './pages/List'
import Settings from './pages/Settings'
import Preview from './pages/Preview'
import { App as AntdApp } from 'antd'

function App() {
  return (
    <AntdApp>
      <Router>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Home />} />
            <Route path="list" element={<List />} />
            <Route path="settings" element={<Settings />} />
            <Route path="list/preview/:id" element={<Preview />} />
        </Route>
      </Routes>
    </Router>
    </AntdApp>
  )
}

export default App
