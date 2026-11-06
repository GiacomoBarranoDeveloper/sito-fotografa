import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { PHOTOS, SCREEN_PHOTO } from './photos'
import { smooth } from './math'
import { SCREEN } from './screenConfig'
import SceneBoundary from './SceneBoundary'

const HeroScene = lazy(() => import('./HeroScene'))

export default function App() {
  const story = useRef(null)
  const progress = useRef(0)
  const heroText = useRef(null)
  const reveal = useRef(null)
  // il 3D si ferma quando la foto a pagina intera lo copre (decide HeroScene, vedi onCover)
  const [active, setActive] = useState(true)
  const activeRef = useRef(true)
  // dissolvenza d'ingresso del canvas quando il modello è pronto
  const [ready, setReady] = useState(false)

  const onCover = useCallback((isCovered) => {
    if (isCovered && activeRef.current) {
      activeRef.current = false
      setActive(false)
    }
  }, [])
  const onReady = useCallback(() => setReady(true), [])

  useEffect(() => {
    const update = () => {
      const el = story.current
      const total = el.offsetHeight - window.innerHeight
      const p = Math.min(1, Math.max(0, -el.getBoundingClientRect().top / total))
      progress.current = p

      const fade = smooth(0.02, 0.14, p)
      const t = heroText.current
      t.style.opacity = 1 - fade
      t.style.transform = `translateY(${fade * -30}px)`
      t.style.visibility = fade > 0.98 ? 'hidden' : 'visible'

      // si torna su: riaccendiamo il 3D (l'opacità della foto la gestisce HeroScene)
      if (p < 0.965 && !activeRef.current) {
        activeRef.current = true
        setActive(true)
      }
    }

    let raf = 0
    const onScroll = () => {
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          update()
        })
      }
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <>
      <nav className="nav">
        <a href="#chi-sono">Chi sono</a>
        <a href="#portfolio">Portfolio</a>
        <a href="#prezzi">Prezzi</a>
        <a href="#contatti">Contatti</a>
      </nav>

      <section className="story" ref={story}>
        <div className="stage">
          <div className={`hero-canvas${ready ? ' ready' : ''}`}>
            <SceneBoundary>
              <Suspense fallback={null}>
                <HeroScene
                  progress={progress}
                  reveal={reveal}
                  active={active}
                  onCover={onCover}
                  onReady={onReady}
                />
              </Suspense>
            </SceneBoundary>
          </div>

          <div className="hero-text" ref={heroText}>
            <h1>Noemi Barrano</h1>
            <p className="tagline">Fotografa di eventi e ritratti</p>
            <a className="cta" href="#contatti">Prenota il tuo book</a>
          </div>

          <div
            className="reveal"
            ref={reveal}
            aria-hidden="true"
            style={{ '--screen-aspect': SCREEN.w / SCREEN.h }}
          >
            <div className="reveal-frame">
              <img src={SCREEN_PHOTO} alt="" />
            </div>
          </div>
        </div>
      </section>

      <section id="portfolio" className="gallery">
        <h2>Storie in luce</h2>
        <div className="grid">
          {PHOTOS.map((ph, i) => (
            <figure key={ph.src + i}>
              <img src={ph.src} alt={ph.alt} loading="lazy" decoding="async" />
              <figcaption>
                {String(i + 1).padStart(2, '0')} — {ph.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </>
  )
}