import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useTexture, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { SCREEN_PHOTO } from './photos'
import { SCREEN, SCREEN_INSET } from './screenConfig'
import { smooth } from './math'

const MODEL = '/models/camera-5d-opt.glb'
const BASE_Y = -0.55 // angolo di partenza (leggermente di tre quarti)
const TARGET_SIZE = 3 // dimensione apparente del modello
const HERO_LIFT = 0.7 // quanto sta alzata la fotocamera nell'hero (il testo sta sotto)
const FOV = 35

// Aspetto dei materiali: se la fotocamera sembra ancora "plastica" o troppo piatta, ritocca qui.
//  normalScale   → quanto sono marcati i rilievi (1 = originale, più basso = più liscio)
//  envIntensity  → quanto riflette l'ambiente
//  specular      → intensità dei riflessi speculari
const LOOK = { normalScale: 0.4, envIntensity: 0.9, specular: 0.6 }

const { damp, lerp, degToRad } = THREE.MathUtils

function Camera3D({ progress, reveal, onCover, onReady }) {
  const { scene } = useGLTF(MODEL)
  const photo = useTexture(SCREEN_PHOTO)
  const pivot = useRef()
  const photoMesh = useRef()
  const covered = useRef(false)
  const gl = useThree((state) => state.gl)
  const cfg = useRef({ ...SCREEN }) // valori "vivi" dello schermo (modificabili con ?tune)

  // chi preferisce meno movimento: niente fluttuazione né inclinazione verso il puntatore
  const calm = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const { scale, center } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    return {
      scale: TARGET_SIZE / Math.max(size.x, size.y, size.z),
      center: box.getCenter(new THREE.Vector3()),
    }
  }, [scene])

  // Dissolvenza d'ingresso: il canvas compare solo quando il modello è pronto.
  useEffect(() => {
    const t = setTimeout(() => onReady?.(), 120)
    return () => clearTimeout(t)
  }, [onReady])

  // Materiali. Nel file sono in modalità "BLEND" (trasparenti): costa molto
  // (ordinamento, niente profondità). Li rendiamo opachi e addolciamo l'aspetto.
  useEffect(() => {
    scene.traverse((o) => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m) => {
        m.transparent = false
        m.depthWrite = true
        // Il 5D ha un solo materiale ("DSLR"). Se compaiono buchi o zone fantasma
        // sul corpo, prova a mettere alphaTest = 0.5 anche per lui.
        m.alphaTest = m.name === 'Camera' ? 0.5 : 0
        if ('transmission' in m) {
          m.transmission = 0
          m.transmissionMap = null
        }
        if (m.normalScale) m.normalScale.setScalar(LOOK.normalScale)
        if ('envMapIntensity' in m) m.envMapIntensity = LOOK.envIntensity
        if ('specularIntensity' in m) m.specularIntensity = LOOK.specular
        m.needsUpdate = true
      })
    })
  }, [scene])

  // Modalità taratura: apri il sito con ?tune, scorri fino allo schermo e usa
  //   frecce = sposta (Shift = passo grande), + / - = ingrandisci / riduci, [ ] = avanti / indietro
  // I valori nuovi compaiono nella console: copiali in screenConfig.js.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('tune')) return
    const onKey = (e) => {
      const c = cfg.current
      const st = e.shiftKey ? 5 : 1
      let used = true
      // visto da dietro, destra e sinistra sono invertite rispetto al modello
      if (e.key === 'ArrowLeft') c.x += st
      else if (e.key === 'ArrowRight') c.x -= st
      else if (e.key === 'ArrowUp') c.y += st
      else if (e.key === 'ArrowDown') c.y -= st
      else if (e.key === '+' || e.key === '=') { c.w *= 1.03; c.h *= 1.03 }
      else if (e.key === '-') { c.w /= 1.03; c.h /= 1.03 }
      else if (e.key === '[') c.z += 0.5
      else if (e.key === ']') c.z -= 0.5
      else used = false
      if (used) {
        e.preventDefault()
        console.log(
          `export const SCREEN = { x: ${c.x.toFixed(1)}, y: ${c.y.toFixed(1)}, w: ${c.w.toFixed(1)}, h: ${c.h.toFixed(1)}, z: ${c.z.toFixed(1)} }`,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Schermo LCD: bordo nero + foto "a cover" con angoli arrotondati e un leggero riflesso.
  // Disegnato su un canvas grande, così resta nitido anche quando lo schermo riempie la pagina.
  const screenTex = useMemo(() => {
    const img = photo.image
    const W = 2048
    const H = Math.round((W * SCREEN.h) / SCREEN.w)
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d')
    const round = (x, y, w, h, r) => {
      ctx.beginPath()
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
      else ctx.rect(x, y, w, h)
    }

    ctx.fillStyle = '#050505'
    round(0, 0, W, H, H * 0.045)
    ctx.fill()

    const px = W * SCREEN_INSET
    const py = H * SCREEN_INSET
    const iw = W - 2 * px
    const ih = H - 2 * py
    ctx.save()
    round(px, py, iw, ih, H * 0.025)
    ctx.clip()
    const k = Math.max(iw / img.width, ih / img.height)
    const dw = img.width * k
    const dh = img.height * k
    ctx.drawImage(img, px + (iw - dw) / 2, py + (ih - dh) / 2, dw, dh)
    const glare = ctx.createLinearGradient(0, 0, W, H)
    glare.addColorStop(0, 'rgba(255,255,255,0.12)')
    glare.addColorStop(0.4, 'rgba(255,255,255,0)')
    glare.addColorStop(1, 'rgba(0,0,0,0.10)')
    ctx.fillStyle = glare
    ctx.fillRect(px, py, iw, ih)
    ctx.restore()

    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = gl.capabilities.getMaxAnisotropy()
    return t
  }, [photo, gl])

  useFrame((state, delta) => {
    const p = progress.current // 0 → 1 su tutta la sezione "story"
    const g = pivot.current
    const c = cfg.current
    const aspect = state.size.width / state.size.height
    const wide = aspect > 1
    const tilt = calm ? 0 : 1

    // schermo (posizione/dimensione correnti)
    photoMesh.current.position.set(c.x, c.y, c.z)
    photoMesh.current.scale.set(c.w / SCREEN.w, c.h / SCREEN.h, 1)

    // centro dello schermo rispetto al centro del modello, in unità di scena
    const vx = (c.x - center.x) * scale
    const vy = (c.y - center.y) * scale
    const vz = (c.z - center.z) * scale

    const a = smooth(0.05, 0.5, p) // la fotocamera gira sul retro
    const b = smooth(0.45, 0.85, p) // ci si avvicina allo schermo

    // distanza a cui lo schermo copre tutta la finestra
    const tanH = Math.tan(degToRad(FOV / 2))
    // (si misura sulla foto, senza il bordo nero)
    const inner = 1 - 2 * SCREEN_INSET
    const dFill = Math.min(
      (c.h * inner * scale) / (2 * tanH),
      (c.w * inner * scale) / (2 * tanH * aspect),
    )

    // distanza di riposo: su schermi stretti (telefono) ci si allontana per non tagliare il corpo
    const restZ = Math.max(7, 3.6 / (2 * tanH * aspect))

    const baseY = wide ? HERO_LIFT : 0.9
    const bob = calm ? 0 : Math.sin(state.clock.elapsedTime * 1.1) * 0.06 * (1 - b)

    // a rotazione completa (retro verso di noi) lo schermo sta in (-vx, vy, -vz)
    const px = lerp(0, vx, b)
    const py = lerp(baseY * (1 - a), -vy, b) + bob
    const ry = BASE_Y + (-Math.PI - BASE_Y) * a + state.pointer.x * 0.35 * (1 - a) * tilt
    const rx = -state.pointer.y * 0.15 * (1 - b) * tilt
    const camZ = lerp(restZ, -vz + dFill, b)

    g.rotation.y = damp(g.rotation.y, ry, 4, delta)
    g.rotation.x = damp(g.rotation.x, rx, 4, delta)
    g.position.x = damp(g.position.x, px, 3, delta)
    g.position.y = damp(g.position.y, py, 3, delta)
    state.camera.position.z = damp(state.camera.position.z, camZ, 3, delta)

    // Foto a pagina intera: compare solo quando il 3D ha davvero raggiunto la posizione finale
    // (non quando lo scroll ci arriva). Così non c'è mai la doppia immagine sfasata.
    const err =
      (Math.abs(g.position.x - px) +
        Math.abs(g.position.y - py) +
        Math.abs(state.camera.position.z - camZ) +
        1.5 * (Math.abs(g.rotation.y - ry) + Math.abs(g.rotation.x - rx))) /
      dFill
    const settle = 1 - smooth(0.005, 0.06, err)
    const o = smooth(0.84, 0.97, p) * settle
    if (reveal.current) reveal.current.style.opacity = o

    // quando la foto copre tutto, avvisiamo la pagina: può fermare il rendering 3D
    const isCovered = o > 0.999
    if (isCovered !== covered.current) {
      covered.current = isCovered
      onCover?.(isCovered)
    }
  })

  return (
    <group ref={pivot} position={[0, HERO_LIFT, 0]} rotation={[0, BASE_Y, 0]}>
      <group position={[-center.x * scale, -center.y * scale, -center.z * scale]} scale={scale}>
        <primitive object={scene} />
        <mesh ref={photoMesh} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[SCREEN.w, SCREEN.h]} />
          <meshBasicMaterial map={screenTex} alphaTest={0.5} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

export default function HeroScene({ progress, reveal, active = true, onCover, onReady }) {
  // risoluzione adattiva: parte moderata e sale solo se il dispositivo regge
  const [dpr, setDpr] = useState(1.15)

  return (
    <Canvas
      dpr={dpr}
      frameloop={active ? 'always' : 'never'}
      gl={{ powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 7], fov: FOV, near: 0.3 }}
    >
      <PerformanceMonitor
        onChange={({ factor }) => setDpr(Math.min(1.5, Math.max(0.8, 0.8 + 0.7 * factor)))}
      />
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 3, 4]} intensity={1.2} color="#fff4ea" />
      <Suspense fallback={null}>
        <Camera3D progress={progress} reveal={reveal} onCover={onCover} onReady={onReady} />
        {/* softbox da studio, luce quasi neutra: i colori veri del modello, senza scaricare HDR */}
        <Environment resolution={256}>
          <Lightformer intensity={6} position={[-4, 3, 3]} scale={[4, 6, 1]} color="#ffffff" />
          <Lightformer intensity={3} position={[4, 0, 3]} scale={[3, 5, 1]} color="#fff1e6" />
          <Lightformer intensity={3} position={[0, 5, 1]} scale={[8, 2, 1]} color="#ffffff" />
          <Lightformer intensity={2} position={[0, -3, 3]} scale={[6, 1.5, 1]} color="#ffffff" />
          {/* un tocco di terracotta come luce di taglio da dietro (più morbido di prima) */}
          <Lightformer intensity={1.2} position={[4, 1, -4]} scale={[2, 5, 1]} color="#c9754d" />
        </Environment>
      </Suspense>
    </Canvas>
  )
}

useGLTF.preload(MODEL)