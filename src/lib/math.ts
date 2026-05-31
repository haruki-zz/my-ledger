export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(value, min));
}

export function clampToRange(value: number, min: number, max: number) {
  return clamp(value, min, Math.max(min, max));
}
