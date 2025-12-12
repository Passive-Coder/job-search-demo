import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text3D, Center, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

function ACMLogo3D() {
  const lightRef = useRef()
  const taglineLightRef = useRef()
  const groupRef = useRef()
  const shadowRef = useRef()

  // Animate the light revolving around the logo in x-y plane with constant speed
  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()
    const radius = 5
    
    // Constant anti-clockwise rotation with constant speed
    const baseSpeed = 1
    const angle = -time * baseSpeed
    
    // Move light in circular path anti-clockwise - z stays at a fixed distance from logo
    lightRef.current.position.x = Math.sin(angle) * radius
    lightRef.current.position.y = Math.cos(angle) * radius
    lightRef.current.position.z = 4
    
    // Smooth intensity transitions: 90% reveal for 80% time, 50% reveal for 20% time
    const normalizedAngle = (angle % (Math.PI * 2))
    const normalizedCycleAngle = normalizedAngle < 0 ? Math.PI * 2 + normalizedAngle : normalizedAngle
    const fullCycleAngle = Math.PI * 2
    const dimPhaseEnd = fullCycleAngle * 0.2 // 20% of cycle is dim (50% visibility)
    
    const minIntensity = 80  // 50% visibility
    const maxIntensity = 250 // 90% visibility
    
    if (normalizedCycleAngle < dimPhaseEnd) {
      // First 20% - slowly fade out to 50% visibility
      const fadeProgress = normalizedCycleAngle / dimPhaseEnd
      lightRef.current.intensity = maxIntensity - (maxIntensity - minIntensity) * fadeProgress
    } else {
      // Remaining 80% - rapidly fade in and maintain 90% visibility
      const fadeProgress = (normalizedCycleAngle - dimPhaseEnd) / (fullCycleAngle - dimPhaseEnd)
      const easeIn = fadeProgress * fadeProgress * fadeProgress // Cubic ease-in
      lightRef.current.intensity = minIntensity + (maxIntensity - minIntensity) * easeIn
    }
    
    // Additional light for tagline to always be visible
    taglineLightRef.current.position.copy(lightRef.current.position)
    taglineLightRef.current.intensity = lightRef.current.intensity * 0.6
  })

  // Create rounded diamond shape using a custom shape
  const diamondShape = useMemo(() => {
    const shape = new THREE.Shape()
    const size = 2.5
    const radius = 0.35 // Rounded corner radius
    
    // Create diamond path with all corners rounded
    // Start just after top corner and go clockwise
    shape.moveTo(radius, size - radius)
    shape.quadraticCurveTo(0, size, -radius, size - radius)
    
    // Top to left
    shape.lineTo(-size + radius, radius)
    shape.quadraticCurveTo(-size, 0, -size + radius, -radius)
    
    // Left to bottom
    shape.lineTo(-radius, -size + radius)
    shape.quadraticCurveTo(0, -size, radius, -size + radius)
    
    // Bottom to right
    shape.lineTo(size - radius, -radius)
    shape.quadraticCurveTo(size, 0, size - radius, radius)
    
    // Right to top
    shape.lineTo(radius, size - radius)
    
    return shape
  }, [])

  return (
    <>
      {/* Very minimal ambient light - almost no base illumination */}
      <ambientLight intensity={0.05} />
      
      {/* Revolving point light with varying intensity */}
      <pointLight 
        ref={lightRef} 
        intensity={80} 
        distance={12}
        decay={2}
        color="#ffffff"
      />
      
      {/* Additional light for tagline to always be visible */}
      <pointLight 
        ref={taglineLightRef} 
        intensity={100} 
        distance={12}
        decay={2}
        color="#ffffff"
      />
      
      {/* Logo group - FIXED, no rotation */}
      <group ref={groupRef}>
        {/* Diamond/rhombus shape background with rounded corners */}
        <mesh position={[0, 0, -0.5]}>
          <extrudeGeometry
            args={[
              diamondShape,
              {
                depth: 0.4,
                bevelEnabled: true,
                bevelThickness: 0.05,
                bevelSize: 0.05,
                bevelSegments: 8,
              },
            ]}
          />
          <meshStandardMaterial
            color="#e8e8e8"
            metalness={0.95}
            roughness={0.12}
            envMapIntensity={0} // No environment reflections
          />
        </mesh>

        {/* ACM Text */}
        <Center position={[0, 0, -0.1]}>
          <Text3D
            font="/fonts/helvetiker_bold.typeface.json"
            size={1.2}
            height={0.3}
            curveSegments={16}
            bevelEnabled={true}
            bevelThickness={0.05}
            bevelSize={0.02}
            bevelOffset={0}
            bevelSegments={8}
          >
            acm
            <meshStandardMaterial
              color="#2a2a2a"
              metalness={0.98}
              roughness={0.08}
              envMapIntensity={0} // No environment reflections
            />
          </Text3D>
        </Center>

        {/* Tagline Text - in a plane, centered horizontally - 2D metallic text */}
        <group position={[0, -3.75, 0]}>
          <Center>
            <Text3D
              font="/fonts/helvetiker_bold.typeface.json"
              size={0.32}
              height={0.01}
              curveSegments={12}
              bevelEnabled={false}
            >
              Because Technology Matters
              <meshStandardMaterial
                color="#ffffff"
                metalness={0.95}
                roughness={0.1}
                envMapIntensity={0}
              />
            </Text3D>
          </Center>
        </group>
      </group>
    </>
  )
}

export default ACMLogo3D
