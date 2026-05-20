import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

const formatNumber = (value) => Number(value).toLocaleString('uk-UA', { maximumFractionDigits: 2 })
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
// Плавна поява з невеликим «відскоком»
const easeOutBack = (t) => {
  const c = 1.7
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}

// Текстовий запис формули -> гарний математичний вигляд
const prettyMath = (text) =>
  String(text)
    .replace(/\^3/g, '³')
    .replace(/\^2/g, '²')
    .replace(/sqrt/g, '√')
    .replace(/\bpi\b/g, 'π')
    .replace(/Sосн/g, 'S₀сн')
    .replace(/\*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim()

/* ----------------------------------------------------------------------
 * Геометрія: реальні математичні розрахунки за параметрами фігури (см)
 * -------------------------------------------------------------------- */
const geometryService = {
  cube: ({ edge }) => ({
    base: edge * edge,
    lateral: 4 * edge * edge,
    area: 6 * edge * edge,
    volume: edge ** 3,
    steps: [
      `Sосн = a^2 = ${edge}^2 = ${formatNumber(edge * edge)}`,
      `V = a^3 = ${edge}^3 = ${formatNumber(edge ** 3)}`,
      `S = 6a^2 = 6 * ${edge}^2 = ${formatNumber(6 * edge * edge)}`,
    ],
  }),
  prism: ({ edge, height }) => ({
    base: edge * edge,
    lateral: 4 * edge * height,
    area: 2 * edge * edge + 4 * edge * height,
    volume: edge * edge * height,
    steps: [
      `Sосн = a^2 = ${edge}^2 = ${formatNumber(edge * edge)}`,
      `Sб = 4ah = 4 * ${edge} * ${height} = ${formatNumber(4 * edge * height)}`,
      `V = Sосн * h = ${formatNumber(edge * edge)} * ${height} = ${formatNumber(edge * edge * height)}`,
    ],
  }),
  pyramid: ({ edge, height }) => {
    const slant = Math.sqrt((edge / 2) ** 2 + height ** 2)
    return {
      base: edge * edge,
      lateral: 2 * edge * slant,
      area: edge * edge + 2 * edge * slant,
      volume: (edge * edge * height) / 3,
      steps: [
        `l = sqrt((a/2)^2 + h^2) = sqrt(${edge / 2}^2 + ${height}^2) = ${formatNumber(slant)}`,
        `V = 1/3 * a^2 * h = 1/3 * ${formatNumber(edge * edge)} * ${height} = ${formatNumber((edge * edge * height) / 3)}`,
        `S = a^2 + 2al = ${formatNumber(edge * edge)} + 2 * ${edge} * ${formatNumber(slant)} = ${formatNumber(edge * edge + 2 * edge * slant)}`,
      ],
    }
  },
  cone: ({ radius, height }) => {
    const slant = Math.sqrt(radius ** 2 + height ** 2)
    return {
      base: Math.PI * radius ** 2,
      lateral: Math.PI * radius * slant,
      area: Math.PI * radius * (radius + slant),
      volume: (Math.PI * radius ** 2 * height) / 3,
      steps: [
        `l = sqrt(r^2 + h^2) = sqrt(${radius}^2 + ${height}^2) = ${formatNumber(slant)}`,
        `V = 1/3 * pi * r^2 * h = 1/3 * pi * ${radius}^2 * ${height} = ${formatNumber((Math.PI * radius ** 2 * height) / 3)}`,
        `S = pi * r(r + l) = pi * ${radius} * (${radius} + ${formatNumber(slant)}) = ${formatNumber(Math.PI * radius * (radius + slant))}`,
      ],
    }
  },
  cylinder: ({ radius, height }) => ({
    base: Math.PI * radius ** 2,
    lateral: 2 * Math.PI * radius * height,
    area: 2 * Math.PI * radius * (radius + height),
    volume: Math.PI * radius ** 2 * height,
    steps: [
      `Sосн = pi * r^2 = pi * ${radius}^2 = ${formatNumber(Math.PI * radius ** 2)}`,
      `Sб = 2pi * r * h = 2pi * ${radius} * ${height} = ${formatNumber(2 * Math.PI * radius * height)}`,
      `V = Sосн * h = ${formatNumber(Math.PI * radius ** 2)} * ${height} = ${formatNumber(Math.PI * radius ** 2 * height)}`,
    ],
  }),
}

const solids = [
  {
    id: 'cube',
    name: 'Куб',
    badge: '6 граней',
    lead: 'Усі ребра рівні, кожна грань є квадратом.',
    uses: ['edge'],
    parameters: ['a — ребро куба'],
    facts: [['Грані', '6 квадратів'], ['Ребра', '12 рівних'], ['Вершини', '8']],
    formulas: ['V = a^3', 'S = 6a^2', 'Sб = 4a^2'],
  },
  {
    id: 'prism',
    name: 'Квадратна призма',
    badge: '2 основи',
    lead: 'Дві рівні квадратні основи з’єднані прямокутними бічними гранями.',
    uses: ['edge', 'height'],
    parameters: ['a — сторона основи', 'h — висота призми'],
    facts: [['Основи', '2 квадрати'], ['Бічні грані', '4 прямокутники'], ['Вершини', '8']],
    formulas: ['V = Sосн * h = a^2h', 'S = 2a^2 + 4ah', 'Sб = 4ah'],
  },
  {
    id: 'pyramid',
    name: 'Квадратна піраміда',
    badge: '1 вершина',
    lead: 'Квадратна основа і чотири трикутні грані сходяться в одну вершину.',
    uses: ['edge', 'height'],
    parameters: ['a — сторона основи', 'h — висота', 'l — апофема'],
    facts: [['Грані', '1 + 4 трикутні'], ['Ребра', '8'], ['Вершини', '5']],
    formulas: ['V = 1/3 * Sосн * h', 'S = a^2 + 2al', 'Sб = 2al'],
  },
  {
    id: 'cone',
    name: 'Конус',
    badge: 'r + h',
    lead: 'Кругла основа і вершина, бічна поверхня утворює плавний нахил.',
    uses: ['radius', 'height'],
    parameters: ['r — радіус основи', 'h — висота', 'l — твірна'],
    facts: [['Основа', 'коло'], ['Вершина', '1 точка'], ['Розгортка', 'сектор']],
    formulas: ['V = 1/3 * pi * r^2 * h', 'S = pi * r(r + l)', 'Sб = pi * r * l'],
  },
  {
    id: 'cylinder',
    name: 'Циліндр',
    badge: '2 кола',
    lead: 'Дві круглі основи і рівна бічна поверхня з постійною висотою.',
    uses: ['radius', 'height'],
    parameters: ['r — радіус основи', 'h — висота'],
    facts: [['Основи', '2 кола'], ['Вісь', 'пряма'], ['Розгортка', 'прямокутник']],
    formulas: ['V = pi * r^2 * h', 'S = 2pi * r(r + h)', 'Sб = 2pi * r * h'],
  },
]

const solidMap = Object.fromEntries(solids.map((solid) => [solid.id, solid]))

const infoCards = [
  ['Справжнє 3D', 'Моделі будуються через WebGL: реальна геометрія, коректні пропорції і грані.'],
  ['Точні розрахунки', 'Об’єм, повна й бічна площі рахуються за справжніми формулами після кожної зміни.'],
  ['Підписи й розгортка', 'Вмикай літери вершин, дивись розгортку фігури та покрокову підстановку.'],
]

/* ----------------------------------------------------------------------
 * SVG-іконки фігур
 * -------------------------------------------------------------------- */
function ShapeIcon({ id, className = 'h-8 w-8' }) {
  const common = {
    className,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  }
  if (id === 'cube') {
    return (
      <svg {...common}>
        <path d="M16 4l10 5v14l-10 5-10-5V9z" />
        <path d="M16 4l10 5-10 5-10-5z" />
        <path d="M16 14v14" />
      </svg>
    )
  }
  if (id === 'prism') {
    return (
      <svg {...common}>
        <path d="M16 3l9 4v18l-9 4-9-4V7z" />
        <path d="M16 3l9 4-9 4-9-4z" />
        <path d="M16 11v18" />
      </svg>
    )
  }
  if (id === 'pyramid') {
    return (
      <svg {...common}>
        <path d="M16 3l11 21-11 5-11-5z" />
        <path d="M16 3l-7 18 7 3 7-3z" />
        <path d="M5 24l11-3 11 3" />
      </svg>
    )
  }
  if (id === 'cone') {
    return (
      <svg {...common}>
        <path d="M16 3l9 21M16 3L7 24" />
        <ellipse cx="16" cy="24" rx="9" ry="4" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <ellipse cx="16" cy="8" rx="10" ry="4" />
      <path d="M6 8v16M26 8v16" />
      <ellipse cx="16" cy="24" rx="10" ry="4" />
    </svg>
  )
}

/* ----------------------------------------------------------------------
 * Розгортки фігур (SVG)
 * -------------------------------------------------------------------- */
function NetDiagram({ shape }) {
  const stroke = '#0e7490'
  const fill = 'rgba(34, 211, 238, 0.16)'
  const p = { fill, stroke, strokeWidth: 1.6, strokeLinejoin: 'round' }

  if (shape === 'cube' || shape === 'prism') {
    const w = 46
    const h = shape === 'prism' ? 78 : 46
    return (
      <svg viewBox="0 0 230 220" className="net-svg" role="img" aria-label="Розгортка">
        <rect x={68} y={20} width={w} height={w} {...p} />
        <rect x={22} y={20 + w} width={w} height={h} {...p} />
        <rect x={68} y={20 + w} width={w} height={h} {...p} />
        <rect x={114} y={20 + w} width={w} height={h} {...p} />
        <rect x={160} y={20 + w} width={w} height={h} {...p} />
        <rect x={68} y={20 + w + h} width={w} height={w} {...p} />
      </svg>
    )
  }
  if (shape === 'pyramid') {
    return (
      <svg viewBox="0 0 230 220" className="net-svg" role="img" aria-label="Розгортка піраміди">
        <rect x={88} y={88} width={54} height={54} {...p} />
        <path d="M88 88 L142 88 L115 24 Z" {...p} />
        <path d="M142 88 L142 142 L206 115 Z" {...p} />
        <path d="M88 142 L142 142 L115 206 Z" {...p} />
        <path d="M88 88 L88 142 L24 115 Z" {...p} />
      </svg>
    )
  }
  if (shape === 'cone') {
    return (
      <svg viewBox="0 0 230 220" className="net-svg" role="img" aria-label="Розгортка конуса">
        <path d="M115 30 A95 95 0 0 1 200 150 L115 110 Z" {...p} />
        <circle cx={70} cy={150} r={42} {...p} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 230 220" className="net-svg" role="img" aria-label="Розгортка циліндра">
      <ellipse cx={55} cy={45} rx={34} ry={20} {...p} />
      <rect x={24} y={78} width={182} height={66} {...p} />
      <ellipse cx={55} cy={178} rx={34} ry={20} {...p} />
    </svg>
  )
}

/* ----------------------------------------------------------------------
 * 3D-сцена на Three.js (справжня WebGL-геометрія)
 * -------------------------------------------------------------------- */
function makeLabelSprite(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.roundRect(36, 78, 184, 100, 30)
  ctx.fill()
  ctx.fillStyle = '#67e8f9'
  ctx.font = 'bold 96px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 132)
  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
  return new THREE.Sprite(material)
}

// Координати вершин для підписів (центр фігури — початок координат)
function labelPoints(shape, values) {
  const hx = values.edge / 2
  if (shape === 'cube' || shape === 'prism') {
    const hy = (shape === 'cube' ? values.edge : values.height) / 2
    return [
      { l: 'A', p: [-hx, -hy, hx] },
      { l: 'B', p: [hx, -hy, hx] },
      { l: 'C', p: [hx, -hy, -hx] },
      { l: 'D', p: [-hx, -hy, -hx] },
      { l: 'A₁', p: [-hx, hy, hx] },
      { l: 'B₁', p: [hx, hy, hx] },
      { l: 'C₁', p: [hx, hy, -hx] },
      { l: 'D₁', p: [-hx, hy, -hx] },
    ]
  }
  if (shape === 'pyramid') {
    const hy = values.height / 2
    return [
      { l: 'A', p: [-hx, -hy, hx] },
      { l: 'B', p: [hx, -hy, hx] },
      { l: 'C', p: [hx, -hy, -hx] },
      { l: 'D', p: [-hx, -hy, -hx] },
      { l: 'S', p: [0, hy, 0] },
    ]
  }
  return []
}

function buildGeometry(shape, values) {
  const { edge, height, radius } = values
  if (shape === 'cube') return new THREE.BoxGeometry(edge, edge, edge)
  if (shape === 'prism') return new THREE.BoxGeometry(edge, height, edge)
  if (shape === 'pyramid') {
    const geom = new THREE.ConeGeometry((edge / 2) * Math.SQRT2, height, 4)
    geom.rotateY(Math.PI / 4)
    return geom
  }
  if (shape === 'cone') return new THREE.ConeGeometry(radius, height, 80)
  return new THREE.CylinderGeometry(radius, radius, height, 80)
}

// Осі координат: рівний стрижень + охайна стрілка
function buildAxes(len) {
  const axes = new THREE.Group()
  const specs = [
    { color: 0xef4444, rot: [0, 0, -Math.PI / 2] }, // x
    { color: 0x22c55e, rot: [0, 0, 0] }, // y
    { color: 0x3b82f6, rot: [Math.PI / 2, 0, 0] }, // z
  ]
  const shaftRadius = len * 0.014
  const headLen = len * 0.13
  const shaftLen = len - headLen
  specs.forEach(({ color, rot }) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 })
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 24), material)
    shaft.position.y = shaftLen / 2
    const head = new THREE.Mesh(new THREE.ConeGeometry(len * 0.042, headLen, 28), material)
    head.position.y = shaftLen + headLen / 2
    const arm = new THREE.Group()
    arm.add(shaft, head)
    arm.rotation.set(rot[0], rot[1], rot[2])
    axes.add(arm)
  })
  return axes
}

function disposeTree(root) {
  root.traverse((node) => {
    if (node.geometry) node.geometry.dispose()
    if (node.material) {
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      materials.forEach((material) => {
        if (material.map) material.map.dispose()
        material.dispose()
      })
    }
  })
}

function SceneControls(props) {
  const {
    tool, autoRotate, showLabels, wireframe, axes, canLabel, zoomRef,
    onTool, onAuto, onLabels, onWireframe, onAxes, onReset, onShot,
  } = props

  return (
    <div className="scene-controls">
      <div className="control-group" role="group" aria-label="Режим керування">
        <button className={tool === 'rotate' ? 'is-active' : ''} type="button" onClick={() => onTool('rotate')}>
          Обертати
        </button>
        <button className={tool === 'move' ? 'is-active' : ''} type="button" onClick={() => onTool('move')}>
          Рухати
        </button>
      </div>
      <span className="zoom-badge" ref={zoomRef} aria-label="Масштаб">100%</span>
      <div className="control-group" role="group" aria-label="Вигляд сцени">
        <button className={autoRotate ? 'is-active' : ''} type="button" onClick={onAuto} aria-pressed={autoRotate}>
          Авто
        </button>
        <button className={wireframe ? 'is-active' : ''} type="button" onClick={onWireframe} aria-pressed={wireframe}>
          Каркас
        </button>
        <button className={axes ? 'is-active' : ''} type="button" onClick={onAxes} aria-pressed={axes}>
          Осі
        </button>
        <button
          className={showLabels ? 'is-active' : ''}
          type="button"
          onClick={onLabels}
          aria-pressed={showLabels}
          disabled={!canLabel}
        >
          Літери
        </button>
      </div>
      <div className="control-group" role="group" aria-label="Дії сцени">
        <button type="button" onClick={onShot}>Знімок</button>
        <button type="button" onClick={onReset}>Скинути</button>
      </div>
    </div>
  )
}

const INITIAL_ROT = { x: -0.42, y: 0.7 }
const WORLD_UP = new THREE.Vector3(0, 1, 0)

// Своя вісь і швидкість автообертання для кожної фігури
const spinConfig = {
  cube: { axis: new THREE.Vector3(1, 1, 1).normalize(), speed: 0.0075 }, // перекид через кут
  prism: { axis: new THREE.Vector3(0, 1, 0), speed: 0.006 }, // рівне вертикальне
  pyramid: { axis: new THREE.Vector3(0, 1, 0), speed: 0.0095 }, // швидке навколо осі
  cone: { axis: new THREE.Vector3(0.5, 1, 0).normalize(), speed: 0.008 }, // нахилене погойдування
  cylinder: { axis: new THREE.Vector3(1, 0, 0.35).normalize(), speed: 0.007 }, // перекочування
}

function ModelStage({ shape, values, activeSolid }) {
  const mountRef = useRef(null)
  const three = useRef({})
  const pointer = useRef(null)
  const zoomRef = useRef(null)
  const [tool, setTool] = useState('rotate')
  const [autoRotate, setAutoRotate] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const [axes, setAxes] = useState(false)
  const canLabel = ['cube', 'prism', 'pyramid'].includes(shape)

  // Стан, який читає цикл рендера (без зайвих ререндерів)
  const live = useRef({ tool, autoRotate, zoom: 1, zoomTarget: 1 })
  live.current.tool = tool
  live.current.autoRotate = autoRotate

  // --- Ініціалізація сцени (один раз) ---
  useEffect(() => {
    const mount = mountRef.current
    const width = mount.clientWidth
    const height = mount.clientHeight

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 2000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(6, 9, 8)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x99e6ff, 0.5)
    fill.position.set(-7, -3, -5)
    scene.add(fill)

    const pivot = new THREE.Group()
    pivot.rotation.set(INITIAL_ROT.x, INITIAL_ROT.y, 0)
    scene.add(pivot)

    const camDir = new THREE.Vector3(0.1, 0.18, 1).normalize()

    three.current = { scene, camera, renderer, pivot, camDir, baseDist: 60 }

    const renderFrame = () => {
      const s = three.current

      // Плавний зум до цільового значення
      live.current.zoom += (live.current.zoomTarget - live.current.zoom) * 0.16
      if (zoomRef.current) zoomRef.current.textContent = `${Math.round(live.current.zoom * 100)}%`

      if (s.baseDist) {
        camera.position.copy(s.camDir).multiplyScalar(s.baseDist / live.current.zoom)
        camera.lookAt(0, 0, 0)
      }

      // Анімація появи фігури: піднімається від основи з відскоком
      if (s.enterAt && s.model) {
        const t = Math.min((performance.now() - s.enterAt) / 640, 1)
        const e = easeOutBack(t)
        s.model.scale.setScalar(Math.max(e, 0.001))
        s.model.position.y = (e - 1) * (s.modelHeight / 2)
        s.model.rotation.y = (1 - t) * -0.95
        if (t >= 1) {
          s.enterAt = null
          s.model.scale.setScalar(1)
          s.model.position.y = 0
          s.model.rotation.y = 0
        }
      }

      if (live.current.autoRotate && s.spin) {
        pivot.rotateOnWorldAxis(s.spin.axis, s.spin.speed)
      }
      renderer.render(scene, camera)
      s.raf = requestAnimationFrame(renderFrame)
    }
    renderFrame()

    const resize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)

    // Керування з клавіатури (зручно на ноутбуці)
    const onKey = (event) => {
      const tag = document.activeElement && document.activeElement.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (event.key === '+' || event.key === '=') {
        live.current.zoomTarget = clamp(live.current.zoomTarget + 0.2, 0.5, 2.6)
      } else if (event.key === '-' || event.key === '_') {
        live.current.zoomTarget = clamp(live.current.zoomTarget - 0.2, 0.5, 2.6)
      } else if (['r', 'R', 'к', 'К'].includes(event.key)) {
        three.current.pivot.rotation.set(INITIAL_ROT.x, INITIAL_ROT.y, 0)
        three.current.pivot.position.set(0, 0, 0)
        live.current.zoomTarget = 1
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      cancelAnimationFrame(three.current.raf)
      observer.disconnect()
      window.removeEventListener('keydown', onKey)
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  // --- Перебудова моделі при зміні фігури / розмірів ---
  useEffect(() => {
    const s = three.current
    if (!s.pivot) return

    if (s.model) {
      s.pivot.remove(s.model)
      disposeTree(s.model)
    }

    const geometry = buildGeometry(shape, values)
    geometry.computeBoundingSphere()

    const surface = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        metalness: 0.15,
        roughness: 0.35,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
      }),
    )
    surface.visible = !wireframe

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 30),
      new THREE.LineBasicMaterial({ color: 0x0e7490 }),
    )

    const model = new THREE.Group()
    model.add(surface)
    model.add(wire)

    // Підписи вершин
    const labels = []
    labelPoints(shape, values).forEach(({ l, p }) => {
      const sprite = makeLabelSprite(l)
      const size = Math.max(values.edge, values.height) * 0.22
      sprite.scale.set(size, size * 0.55, 1)
      sprite.position.set(p[0], p[1], p[2])
      sprite.visible = showLabels && canLabel
      model.add(sprite)
      labels.push(sprite)
    })

    // Осі координат: початок О — у центрі нижньої основи фігури
    const modelHeight = shape === 'cube' ? values.edge : values.height
    const axisLen = Math.max(values.edge, values.height, values.radius * 2) * 1.05
    const axesGroup = buildAxes(axisLen)
    axesGroup.position.y = -modelHeight / 2
    const axisLabelSize = axisLen * 0.3
    ;[
      ['x', [axisLen + axisLabelSize * 0.55, 0, 0]],
      ['y', [0, axisLen + axisLabelSize * 0.55, 0]],
      ['z', [0, 0, axisLen + axisLabelSize * 0.55]],
      ['О', [-axisLabelSize * 0.6, -axisLabelSize * 0.5, axisLabelSize * 0.6]],
    ].forEach(([letter, pos]) => {
      const sprite = makeLabelSprite(letter)
      sprite.scale.set(axisLabelSize, axisLabelSize * 0.55, 1)
      sprite.position.set(pos[0], pos[1], pos[2])
      axesGroup.add(sprite)
    })
    axesGroup.visible = axes
    model.add(axesGroup)

    s.pivot.add(model)
    s.model = model
    s.surface = surface
    s.labels = labels
    s.axesGroup = axesGroup
    s.modelHeight = modelHeight
    s.spin = spinConfig[shape]
    s.baseDist = (geometry.boundingSphere.radius / Math.sin((42 / 2) * (Math.PI / 180))) * 1.45

    // Анімація появи — лише при зміні фігури, не на кожен рух повзунка
    if (s.lastShape !== shape) {
      s.enterAt = performance.now()
      model.scale.setScalar(0.001)
    } else {
      model.scale.setScalar(1)
      model.position.y = 0
    }
    s.lastShape = shape
  }, [shape, values]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Видимість підписів / каркаса / осей ---
  useEffect(() => {
    const s = three.current
    if (s.labels) s.labels.forEach((sprite) => (sprite.visible = showLabels && canLabel))
  }, [showLabels, canLabel])

  useEffect(() => {
    const s = three.current
    if (s.surface) s.surface.visible = !wireframe
  }, [wireframe])

  useEffect(() => {
    const s = three.current
    if (s.axesGroup) s.axesGroup.visible = axes
  }, [axes])

  // --- Керування вказівником ---
  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const s = three.current
    pointer.current = {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      pos: { x: s.pivot.position.x, y: s.pivot.position.y },
    }
    setAutoRotate(false)
  }

  const onPointerMove = (event) => {
    if (!pointer.current) return
    const s = three.current

    if (live.current.tool === 'move') {
      const dx = event.clientX - pointer.current.startX
      const dy = event.clientY - pointer.current.startY
      const scale = s.baseDist / live.current.zoom / 520
      s.pivot.position.x = clamp(pointer.current.pos.x + dx * scale, -s.baseDist, s.baseDist)
      s.pivot.position.y = clamp(pointer.current.pos.y - dy * scale, -s.baseDist, s.baseDist)
      return
    }

    // Вільне обертання у будь-який бік — крок за кроком у системі екрана
    const dx = event.clientX - pointer.current.x
    const dy = event.clientY - pointer.current.y
    const step = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(dy * 0.01, dx * 0.01, 0, 'XYZ'),
    )
    s.pivot.quaternion.premultiply(step)
    pointer.current.x = event.clientX
    pointer.current.y = event.clientY
  }

  const onPointerUp = (event) => {
    pointer.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const onWheel = (event) => {
    event.preventDefault()
    live.current.zoomTarget = clamp(live.current.zoomTarget - event.deltaY * 0.0015, 0.5, 2.6)
  }

  const resetScene = () => {
    const s = three.current
    s.pivot.rotation.set(INITIAL_ROT.x, INITIAL_ROT.y, 0)
    s.pivot.position.set(0, 0, 0)
    live.current.zoomTarget = 1
    setAutoRotate(true)
    setTool('rotate')
  }

  const takeShot = () => {
    const s = three.current
    s.renderer.render(s.scene, s.camera)
    const link = document.createElement('a')
    link.download = `${shape}-geometry.png`
    link.href = s.renderer.domElement.toDataURL('image/png')
    link.click()
  }

  return (
    <div className={`model-stage tool-${tool}`}>
      <SceneControls
        tool={tool}
        autoRotate={autoRotate}
        showLabels={showLabels}
        wireframe={wireframe}
        axes={axes}
        canLabel={canLabel}
        zoomRef={zoomRef}
        onTool={setTool}
        onAuto={() => setAutoRotate((v) => !v)}
        onLabels={() => setShowLabels((v) => !v)}
        onWireframe={() => setWireframe((v) => !v)}
        onAxes={() => setAxes((v) => !v)}
        onReset={resetScene}
        onShot={takeShot}
      />

      <div
        ref={mountRef}
        className="model-canvas"
        role="application"
        aria-label={`3D-модель: ${activeSolid.name}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />

      <div className="stage-dims">
        {activeSolid.uses.includes('edge') && <span>a = {values.edge} см</span>}
        {activeSolid.uses.includes('radius') && <span>r = {values.radius} см</span>}
        {activeSolid.uses.includes('height') && <span>h = {values.height} см</span>}
      </div>

      <p className="stage-hint">Тягни — обертати · колесо / +− — масштаб · R — скинути</p>
    </div>
  )
}

const viewportTabs = [
  { id: 'model', label: '3D-модель' },
  { id: 'net', label: 'Розгортка' },
  { id: 'parts', label: 'Елементи' },
]

function ModelViewport({ shape, values, activeSolid }) {
  const [tab, setTab] = useState('model')

  return (
    <div className="viewport-card dark:border-slate-700 dark:bg-slate-900">
      <div className="viewport-head">
        <h2 className="dark:text-white">{activeSolid.name}</h2>
        <span>{activeSolid.badge}</span>
      </div>

      <div className="viewport-tabs" role="tablist">
        {viewportTabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'is-active' : ''}
            type="button"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="tab-panel" key={tab}>
        {tab === 'model' ? <ModelStage shape={shape} values={values} activeSolid={activeSolid} /> : null}

        {tab === 'net' ? (
          <div className="net-stage">
            <NetDiagram shape={shape} />
            <p>Розгортка показує, з яких плоских фігур складається поверхня тіла.</p>
          </div>
        ) : null}

        {tab === 'parts' ? (
          <div className="parts-stage">
            {activeSolid.facts.map(([title, value]) => (
              <article key={title} className="part-card dark:border-slate-700 dark:bg-slate-800">
                <span className="part-icon">
                  <ShapeIcon id={shape} className="h-6 w-6" />
                </span>
                <p className="part-title dark:text-slate-300">{title}</p>
                <strong className="dark:text-white">{value}</strong>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Slider({ label, hint, value, min, max, onChange }) {
  return (
    <label className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-900">
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-sm font-black text-slate-900 dark:text-white">{label}</span>
          <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">{hint}</span>
        </span>
        <span className="flex items-center gap-1 rounded-lg bg-slate-950 px-2 py-1 dark:bg-slate-700">
          <input
            className="w-12 bg-transparent text-right text-sm font-black text-white outline-none"
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(event) => onChange(clamp(Number(event.target.value) || min, min, max))}
          />
          <span className="text-sm font-bold text-cyan-300">см</span>
        </span>
      </span>
      <input
        className="w-full accent-cyan-500"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function MetricCard({ label, value, unit, accent }) {
  return (
    <article
      className={`rounded-xl p-5 shadow-sm transition ${
        accent ? 'bg-cyan-500 text-slate-950' : 'bg-slate-950 text-white dark:bg-slate-800'
      }`}
    >
      <p className={`text-sm font-bold ${accent ? 'text-slate-800' : 'text-slate-300'}`}>{label}</p>
      <strong className="mt-2 block text-2xl">
        {formatNumber(value)} <span className="text-base font-bold opacity-70">{unit}</span>
      </strong>
    </article>
  )
}

// Рядок чипів вибору фігури (у верхній панелі)
function ShapeChips({ shape, onShapeChange }) {
  return (
    <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
      {solids.map((solid) => (
        <button
          key={solid.id}
          type="button"
          aria-pressed={shape === solid.id}
          onClick={() => onShapeChange(solid.id)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-black transition active:scale-95 ${
            shape === solid.id
              ? 'border-cyan-500 bg-cyan-500 text-slate-950'
              : 'border-slate-200 bg-white text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          <ShapeIcon id={solid.id} className="h-5 w-5" />
          <span className="hidden md:block">{solid.name}</span>
        </button>
      ))}
    </div>
  )
}

// Завжди видимий рядок результатів
function MetricStrip({ metrics }) {
  const items = [
    ['V', metrics.volume, 'см³'],
    ['S', metrics.area, 'см²'],
    ['Sб', metrics.lateral, 'см²'],
  ]
  return (
    <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
      {items.map(([label, value, unit]) => (
        <div key={label} className="rounded-lg bg-slate-950 px-2.5 py-2 dark:bg-slate-800">
          <p className="text-[11px] font-black text-cyan-300">{label}</p>
          <strong className="block truncate text-sm text-white" title={`${formatNumber(value)} ${unit}`}>
            {formatNumber(value)} <span className="text-[10px] opacity-70">{unit}</span>
          </strong>
        </div>
      ))}
    </div>
  )
}

// Вкладка «Розміри»
function ParamsPanel({ values, activeSolid, updateValue, onReset }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <Slider label="Ребро / сторона" hint="a — куб, призма, піраміда" value={values.edge} min={RANGES.edge.min} max={RANGES.edge.max} onChange={updateValue('edge')} />
        <Slider label="Висота" hint="h — призма, піраміда, конус, циліндр" value={values.height} min={RANGES.height.min} max={RANGES.height.max} onChange={updateValue('height')} />
        <Slider label="Радіус" hint="r — конус і циліндр" value={values.radius} min={RANGES.radius.min} max={RANGES.radius.max} onChange={updateValue('radius')} />
      </div>

      <button
        type="button"
        onClick={onReset}
        className="justify-self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-600 transition hover:border-cyan-400 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
      >
        Скинути параметри
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm font-black text-cyan-600">Елементи фігури</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {activeSolid.facts.map(([title, value]) => (
            <div key={title} className="rounded-lg bg-slate-100 p-2.5 text-center dark:bg-slate-900">
              <p className="text-[11px] font-bold uppercase text-slate-400">{title}</p>
              <strong className="mt-1 block text-xs text-slate-800 dark:text-slate-100">{value}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Вкладка «Формули»
function FormulaPanel({ activeSolid, metrics }) {
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm font-black text-cyan-600">Параметри</p>
        <div className="mt-3 grid gap-2">
          {activeSolid.parameters.map((item) => (
            <p key={item} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {item}
            </p>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm font-black text-cyan-600">Формули</p>
        <div className="mt-3 grid gap-2">
          {activeSolid.formulas.map((formula, index) => (
            <code
              key={formula}
              className={`rounded-lg px-3 py-2 text-base font-bold ${
                index === 0 ? 'bg-slate-950 text-cyan-300' : 'bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100'
              }`}
            >
              {prettyMath(formula)}
            </code>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="text-sm font-black text-cyan-600">Підстановка значень</p>
        <ol className="mt-3 grid gap-2">
          {metrics.steps.map((step, index) => (
            <li
              key={step}
              className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-cyan-500 font-black text-slate-950">
                {index + 1}
              </span>
              <span>{prettyMath(step)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:border-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      aria-label={theme === 'dark' ? 'Світла тема' : 'Темна тема'}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}

const RANGES = {
  edge: { min: 2, max: 20 },
  height: { min: 3, max: 30 },
  radius: { min: 1, max: 12 },
}
const DEFAULT_VALUES = { edge: 8, height: 12, radius: 5 }
const panelTabs = [
  { id: 'params', label: 'Розміри' },
  { id: 'formulas', label: 'Формули' },
]

export default function App() {
  const [shape, setShape] = useState('cone')
  const [values, setValues] = useState(DEFAULT_VALUES)
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  const activeSolid = solidMap[shape]
  const metrics = useMemo(() => geometryService[shape](values), [shape, values])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('geometry-theme', theme)
  }, [theme])

  const updateValue = (key) => (value) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const [panelTab, setPanelTab] = useState('params')

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#edf3f7] text-slate-950 dark:bg-slate-950 dark:text-slate-100">
      {/* Верхня панель */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex shrink-0 items-center gap-2 font-black">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-cyan-300 dark:bg-cyan-500 dark:text-slate-950">
            3D
          </span>
          <span className="hidden text-sm sm:block dark:text-white">Geometry Lab</span>
        </div>
        <ShapeChips shape={shape} onShapeChange={setShape} />
        <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      </header>

      {/* Робоча область — заповнює екран, без прокрутки сторінки */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="h-[46vh] shrink-0 p-2.5 lg:h-auto lg:flex-1 lg:p-3">
          <ModelViewport shape={shape} values={values} activeSolid={activeSolid} />
        </div>

        <aside className="flex min-h-0 flex-1 flex-col border-t border-slate-200 bg-white lg:w-[392px] lg:flex-none lg:border-l lg:border-t-0 dark:border-slate-800 dark:bg-slate-900">
          <MetricStrip metrics={metrics} />

          <div className="panel-tabs" role="tablist">
            {panelTabs.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={panelTab === item.id}
                className={panelTab === item.id ? 'is-active' : ''}
                type="button"
                onClick={() => setPanelTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3" key={panelTab}>
            {panelTab === 'params' ? (
              <ParamsPanel
                values={values}
                activeSolid={activeSolid}
                updateValue={updateValue}
                onReset={() => setValues(DEFAULT_VALUES)}
              />
            ) : (
              <FormulaPanel activeSolid={activeSolid} metrics={metrics} />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
