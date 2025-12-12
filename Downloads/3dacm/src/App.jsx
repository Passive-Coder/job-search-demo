import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import ACMLogo3D from './ACMLogo3D'
import './App.css'

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000000' }}>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
      >
        {/* 3D ACM Logo - no environment reflections */}
        <ACMLogo3D minDistance={10}/>
        
        {/* Camera controls - zoom only */}
      </Canvas>
    </div>
  )
}

export default App
