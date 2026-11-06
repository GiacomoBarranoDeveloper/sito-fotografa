// smoothstep: 0 prima di a, 1 dopo b, curva dolce in mezzo
export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
