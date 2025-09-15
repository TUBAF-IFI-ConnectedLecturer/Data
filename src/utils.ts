/**
 * Cache of already-seen strings → colours
 */
const colors: Record<string, string> = {}

/**
 * Hash-based HSL palette
 *  – hue:      0-359  (cycles through the colour wheel)
 *  – saturation: 60-90 % (punchy but not neon)
 *  – lightness: 60-80 % (guaranteed bright on a black background)
 *
 * Converts HSL → HEX so you can keep using three-js/Vuetify with no changes.
 */
export function stringToColor(str: string): string {
  if (colors[str]) return colors[str]

  /* ── 1. hash the string ─────────────────────────────────────────── */
  let hash = 0
  for (const ch of str) {
    hash = (hash << 5) - hash + ch.charCodeAt(0)
    hash |= 0 // keep it 32-bit
  }
  hash = Math.abs(hash)

  /* ── 2. map hash → H, S, L ──────────────────────────────────────── */
  const h = hash % 360 // 0-359
  const s = 60 + ((hash >> 8) % 30) // 60-89 %
  const l = 60 + ((hash >> 16) % 20) // 60-79 %

  /* ── 3. convert to HEX ──────────────────────────────────────────── */
  const color = hslToHex(h, s, l)
  colors[str] = color
  return color
}

/* helper ───────────────────────────────────────────────────────────── */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100

  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) =>
    Math.round(
      255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))
    )
      .toString(16)
      .padStart(2, '0')

  return `#${f(0)}${f(8)}${f(4)}`
}

export function resetNodePositions(nodes: any[]): any[] {
  return nodes.map(({ x, y, z, vx, vy, vz, fx, fy, fz, ...rest }) => ({
    ...rest,
    x: undefined,
    y: undefined,
    z: undefined,
    vx: undefined,
    vy: undefined,
    vz: undefined,
    fx: undefined,
    fy: undefined,
    fz: undefined,
  }))
}

export function includes(base: string, term: string) {
  base = base.toLowerCase()
  let terms = term.toLowerCase().split(' ')

  for (let t of terms) {
    if (!base.includes(t)) return false
  }

  return true
}

export function getOrientation() {
  // fall back to innerWidth / innerHeight
  return window.innerWidth > window.innerHeight ? 'horizontal' : 'vertical'
}

/**
 * URL parameter handling utilities for SPARQL queries and app state
 */

// Encode SPARQL query for URL
export function encodeSparqlForUrl(query: string): string {
  return encodeURIComponent(btoa(query))
}

// Decode SPARQL query from URL
export function decodeSparqlFromUrl(encoded: string): string {
  try {
    return atob(decodeURIComponent(encoded))
  } catch (error) {
    console.warn('Failed to decode SPARQL query from URL:', error)
    return ''
  }
}

// Update URL parameters based on current app state
export function updateUrlParams(params: {
  mode?: 'normal' | 'sparql'
  search?: string | null
  sparqlQuery?: string | null
  sparqlPreset?: string | null
  id?: string | null
  view?: string | null
  title?: string | null
}) {
  const url = new URL(window.location.href)

  // Handle mode parameter
  if (params.mode) {
    url.searchParams.set('mode', params.mode)
  }

  // Handle search parameters (normal mode)
  if (params.mode === 'normal' || !params.mode) {
    if (params.search) {
      url.searchParams.set('search', params.search)
    } else {
      url.searchParams.delete('search')
    }
    // Clear SPARQL parameters when in normal mode
    url.searchParams.delete('sparql')
    url.searchParams.delete('preset')
  }

  // Handle SPARQL parameters
  if (params.mode === 'sparql') {
    if (params.sparqlQuery) {
      url.searchParams.set('sparql', encodeSparqlForUrl(params.sparqlQuery))
    } else {
      url.searchParams.delete('sparql')
    }

    if (params.sparqlPreset) {
      url.searchParams.set('preset', params.sparqlPreset)
    } else {
      url.searchParams.delete('preset')
    }

    // Clear search parameter when in SPARQL mode
    url.searchParams.delete('search')
  }

  // Handle common parameters
  if (params.id) {
    url.searchParams.set('id', params.id)
  } else if (params.id === null) {
    url.searchParams.delete('id')
  }

  if (params.view) {
    url.searchParams.set('view', params.view)
  } else if (params.view === null) {
    url.searchParams.delete('view')
  }

  if (params.title) {
    url.searchParams.set('title', params.title)
  } else if (params.title === null) {
    url.searchParams.delete('title')
  }

  history.replaceState({}, '', url)
}

// Parse URL parameters and return app state
export function parseUrlParams() {
  const params = new URLSearchParams(window.location.search)

  const mode = (params.get('mode') as 'normal' | 'sparql') || 'normal'
  const search = params.get('search')
  const encodedSparql = params.get('sparql')
  const sparqlPreset = params.get('preset')
  const id = params.get('id')
  const view = params.get('view')
  const title = params.get('title')

  let sparqlQuery = ''
  if (encodedSparql) {
    sparqlQuery = decodeSparqlFromUrl(encodedSparql)
  }

  return {
    mode,
    search,
    sparqlQuery,
    sparqlPreset,
    id,
    view,
    title,
  }
}
