// High precision "nice ticks" algorithm (used by D3 / matplotlib)
export function getNiceTicks(min: number, max: number, targetTicks = 8): number[] {
  const range = max - min;
  if (range <= 0 || !isFinite(range)) return [min];

  const roughStep = range / targetTicks;
  const power = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const frac = roughStep / power;

  let niceStep = power;
  if (frac >= 1.5 && frac < 3) niceStep = 2 * power;
  else if (frac >= 3 && frac < 7) niceStep = 5 * power;
  else if (frac >= 7) niceStep = 10 * power;

  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let val = start; val <= max + 1e-9; val += niceStep) {
    ticks.push(Number(val.toFixed(8)));
  }
  return ticks;
}

// Format tick label intelligently
export function formatTick(val: number): string {
  if (Math.abs(val) < 1e-6) return '0';
  if (Math.abs(val) >= 1e4 || Math.abs(val) <= 1e-3) {
    return val.toExponential(1);
  }
  return val.toFixed(2).replace(/\.00$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1');
}
