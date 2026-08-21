(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')

  const initReveal = () => {
    const targets = document.querySelectorAll(
      '.home-feed-heading, .recent-post-item, #aside-content .card-widget, ' +
      '.collection-intro, .article-sort-item:not(.year), .pagination-post, .footer-editorial'
    )

    if (!('IntersectionObserver' in window) || reduceMotion.matches) {
      targets.forEach(target => target.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { rootMargin: '0px 0px -36px', threshold: 0.08 })

    targets.forEach((target, index) => {
      if (target.dataset.revealReady === 'true') return
      target.dataset.revealReady = 'true'
      target.classList.add('reveal-ready')
      target.style.setProperty('--reveal-delay', `${Math.min(index % 6, 4) * 55}ms`)
      observer.observe(target)
    })
  }

  const initAmbientPointer = () => {
    if (document.documentElement.dataset.ambientReady === 'true') return
    document.documentElement.dataset.ambientReady = 'true'

    let queued = false
    let pointerX = window.innerWidth * 0.7
    let pointerY = window.innerHeight * 0.25

    document.addEventListener('pointermove', event => {
      pointerX = event.clientX
      pointerY = event.clientY
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--pointer-x', `${pointerX}px`)
        document.documentElement.style.setProperty('--pointer-y', `${pointerY}px`)
        queued = false
      })
    }, { passive: true })
  }

  const initThemeParticles = () => {
    if (reduceMotion.matches || document.querySelector('.theme-particles')) return

    const layer = document.createElement('div')
    const particleCount = window.matchMedia('(max-width: 768px)').matches ? 18 : 30
    const glyphs = [
      '<svg viewBox="0 0 32 32"><path d="M2 16h8l5-6h15"/><circle cx="10" cy="16" r="2.5"/><circle cx="25" cy="10" r="2.5"/></svg>',
      '<svg viewBox="0 0 32 32"><path d="M25 5H10v22h15"/><path d="m5 12 4 4-4 4"/><circle cx="25" cy="5" r="2"/><circle cx="25" cy="27" r="2"/></svg>',
      '<svg viewBox="0 0 32 32"><path d="M2 17h6l4-10 7 19 5-12h6"/><circle cx="2" cy="17" r="1.8"/><circle cx="30" cy="14" r="1.8"/></svg>',
      '<svg viewBox="0 0 32 32"><ellipse cx="16" cy="16" rx="13" ry="6" transform="rotate(-24 16 16)"/><circle cx="16" cy="16" r="3"/><path d="M7 6 4 3m21 23 3 3"/></svg>'
    ]
    layer.className = 'theme-particles'
    layer.setAttribute('aria-hidden', 'true')

    for (let index = 0; index < particleCount; index += 1) {
      const particle = document.createElement('i')
      const duration = 14 + (index * 7 % 12)
      const delay = -(index * 11 % duration)
      const size = 13 + (index * 5 % 11)
      const drift = -130 + (index * 37 % 260)
      particle.className = `theme-particle theme-particle--${index % 4}`
      particle.innerHTML = glyphs[index % glyphs.length]
      particle.style.setProperty('--particle-x', `${(index * 29 + 7) % 100}vw`)
      particle.style.setProperty('--particle-size', `${size}px`)
      particle.style.setProperty('--particle-duration', `${duration}s`)
      particle.style.setProperty('--particle-delay', `${delay}s`)
      particle.style.setProperty('--particle-drift', `${drift}px`)
      particle.style.setProperty('--particle-sway', `${-54 + (index * 31 % 108)}px`)
      particle.style.setProperty('--particle-spin', `${160 + (index * 47 % 420)}deg`)
      layer.appendChild(particle)
    }

    document.body.appendChild(layer)
  }

  const initPointerAccent = () => {
    document.documentElement.classList.remove('has-custom-cursor')
    document.querySelector('.site-cursor')?.remove()
    document.querySelector('.pointer-accent')?.remove()
    if (!finePointer.matches || reduceMotion.matches || document.querySelector('.cursor-trail')) return

    const trail = document.createElement('div')
    const nodes = []
    const points = []
    trail.className = 'cursor-trail'
    trail.setAttribute('aria-hidden', 'true')

    for (let index = 0; index < 5; index += 1) {
      const node = document.createElement('i')
      node.style.setProperty('--trail-index', index)
      trail.appendChild(node)
      nodes.push(node)
      points.push({ x: -40, y: -40 })
    }

    document.body.appendChild(trail)
    let mouseX = -40
    let mouseY = -40

    const render = () => {
      nodes.forEach((node, index) => {
        const target = index === 0 ? { x: mouseX + 6, y: mouseY + 11 } : points[index - 1]
        const easing = Math.max(0.12, 0.3 - index * 0.035)
        points[index].x += (target.x - points[index].x) * easing
        points[index].y += (target.y - points[index].y) * easing
        node.style.transform = `translate3d(${points[index].x}px, ${points[index].y}px, 0)`
      })
      requestAnimationFrame(render)
    }

    document.addEventListener('pointermove', event => {
      mouseX = event.clientX
      mouseY = event.clientY
      trail.classList.add('is-visible')
    }, { passive: true })
    document.addEventListener('pointerdown', () => trail.classList.add('is-pressed'))
    document.addEventListener('pointerup', () => trail.classList.remove('is-pressed'))
    document.addEventListener('mouseleave', () => trail.classList.remove('is-visible'))
    document.addEventListener('mouseenter', () => trail.classList.add('is-visible'))
    render()
  }

  const initExperience = () => {
    initReveal()
    initAmbientPointer()
    initThemeParticles()
    initPointerAccent()
  }

  document.addEventListener('DOMContentLoaded', initExperience)
  document.addEventListener('pjax:complete', initExperience)
})()
