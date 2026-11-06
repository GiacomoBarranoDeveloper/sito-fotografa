import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'

function PhotoCard({ url }) {
  const ref = useRef()
  const texture = useTexture(url)
  const aspect = texture.image.width / texture.image.height

  useFrame((state, delta) => {
    // inclinazione morbida verso il puntatore
    const { x, y } = state.pointer
    ref.current.rotation.y += (x * 0.3 - ref.current.rotation.y) * 4 * delta
    ref.current.rotation.x += (-y * 0.2 - ref.current.rotation.x) * 4 * delta
  })

  return (
    <mesh ref={ref}>
      <planeGeometry args={[3 * aspect, 3]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

export default function PhotoScene() {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 5], fov: 45 }}>
      <PhotoCard url="/foto/test.jpg" />
    </Canvas>
  )
}