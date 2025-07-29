var colors = {}

export function stringToColor(str: string): string {
  if (colors[str]) {
    return colors[str]
  }

  // 1. Generate a hash from the string
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  // 2. Convert the hash into a valid 6-digit hex color
  let color = '#'
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff
    color += ('00' + value.toString(16)).slice(-2)
  }

  colors[str] = color

  return color
}

export function resetNodePositions(nodes) {
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
