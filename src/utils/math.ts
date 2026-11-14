import { CNumber, TransferFunction, FrequencySpecs, TransientSpecs } from '../types';

// Polynomial multiplication (convolution)
export function conv(p1: number[], p2: number[]): number[] {
  const res = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      res[i + j] += p1[i] * p2[j];
    }
  }
  return res;
}

// Polynomial addition
export function polyAdd(p1: number[], p2: number[]): number[] {
  const maxLen = Math.max(p1.length, p2.length);
  const a = new Array(maxLen - p1.length).fill(0).concat(p1);
  const b = new Array(maxLen - p2.length).fill(0).concat(p2);
  const res = a.map((val, idx) => val + b[idx]);
  // Trim leading zeros
  while (res.length > 1 && Math.abs(res[0]) < 1e-12) {
    res.shift();
  }
  return res;
}

// Polynomial scalar multiplication
export function polyScale(p: number[], scale: number): number[] {
  return p.map(c => c * scale);
}

// Clean up very small coefficients
export function cleanPoly(p: number[]): number[] {
  const maxAbs = Math.max(...p.map(Math.abs));
  if (maxAbs === 0) return [0];
  const cleaned = p.map(c => (Math.abs(c / maxAbs) < 1e-10 ? 0 : c));
  while (cleaned.length > 1 && Math.abs(cleaned[0]) < 1e-12) {
    cleaned.shift();
  }
  return cleaned;
}

// Durand-Kerner algorithm to find all complex roots of a polynomial P(s) = a_n s^n + ... + a_0
export function findRoots(poly: number[]): CNumber[] {
  const p = cleanPoly(poly);
  const n = p.length - 1;
  if (n <= 0) return [];
  if (n === 1) {
    // a1*s + a0 = 0 -> s = -a0/a1
    return [new CNumber(-p[1] / p[0], 0)];
  }
  if (n === 2) {
    // Quadratic formula
    const a = p[0], b = p[1], c = p[2];
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      return [
        new CNumber((-b + Math.sqrt(disc)) / (2 * a), 0),
        new CNumber((-b - Math.sqrt(disc)) / (2 * a), 0)
      ];
    } else {
      return [
        new CNumber(-b / (2 * a), Math.sqrt(-disc) / (2 * a)),
        new CNumber(-b / (2 * a), -Math.sqrt(-disc) / (2 * a))
      ];
    }
  }

  // Normalize polynomial so leading coefficient is 1
  const an = p[0];
  const a = p.map(c => c / an);

  // Initialize roots in a geometric circle
  const roots: CNumber[] = [];
  const r0 = 0.4 + 0.9 * Math.random();
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n + 0.35;
    roots.push(new CNumber(Math.pow(r0, i) * Math.cos(angle), Math.pow(r0, i) * Math.sin(angle)));
  }

  // Iterate Durand-Kerner
  for (let iter = 0; iter < 120; iter++) {
    let maxChange = 0;
    for (let i = 0; i < n; i++) {
      // Evaluate P(roots[i])
      let pVal = new CNumber(a[0]);
      for (let k = 1; k <= n; k++) {
        pVal = pVal.mul(roots[i]).add(a[k]);
      }

      // Evaluate product prod_{j != i} (roots[i] - roots[j])
      let denom = new CNumber(1, 0);
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          denom = denom.mul(roots[i].sub(roots[j]));
        }
      }

      const delta = pVal.div(denom);
      roots[i] = roots[i].sub(delta);
      maxChange = Math.max(maxChange, delta.abs());
    }
    if (maxChange < 1e-10) break;
  }

  // Round near-zero parts and sort by real part
  return roots.map(r => {
    const re = Math.abs(r.re) < 1e-5 ? 0 : r.re;
    const im = Math.abs(r.im) < 1e-5 ? 0 : r.im;
    return new CNumber(re, im);
  }).sort((r1, r2) => r1.re - r2.re || r1.im - r2.im);
}

// Create Transfer Function object
export function createTF(num: number[], den: number[]): TransferFunction {
  const cNum = cleanPoly(num);
  const cDen = cleanPoly(den);
  const zeros = findRoots(cNum);
  const poles = findRoots(cDen);
  const gain = (cNum[0] || 1) / (cDen[0] || 1);

  return {
    type: 'tf',
    num: cNum,
    den: cDen,
    zeros,
    poles,
    gain,
    variable: 's'
  };
}

// Feedback connection: clsys = feedback(G, H, sign) default sign = -1 for negative feedback
export function feedback(G: TransferFunction, H?: TransferFunction | number, sign = -1): TransferFunction {
  let hNum = [1];
  let hDen = [1];
  if (typeof H === 'number') {
    hNum = [H];
    hDen = [1];
  } else if (H) {
    hNum = H.num;
    hDen = H.den;
  }

  // T(s) = (G_num * H_den) / (G_den * H_den - sign * G_num * H_num)
  const clNum = conv(G.num, hDen);
  const term1 = conv(G.den, hDen);
  const term2 = polyScale(conv(G.num, hNum), -sign);
  const clDen = polyAdd(term1, term2);

  return createTF(clNum, clDen);
}

// Evaluate G(s) at complex value s
export function evalTF(tf: TransferFunction, s: CNumber): CNumber {
  // Horner evaluation of num and den
  let nVal = new CNumber(tf.num[0] || 0);
  for (let i = 1; i < tf.num.length; i++) {
    nVal = nVal.mul(s).add(tf.num[i]);
  }

  let dVal = new CNumber(tf.den[0] || 0);
  for (let i = 1; i < tf.den.length; i++) {
    dVal = dVal.mul(s).add(tf.den[i]);
  }

  return nVal.div(dVal);
}

// Frequency response G(jw)
export function freqResp(tf: TransferFunction, w: number): { mag: number; magDB: number; phaseDeg: number; val: CNumber } {
  const s = new CNumber(0, w);
  const val = evalTF(tf, s);
  const mag = val.abs();
  const magDB = 20 * Math.log10(Math.max(mag, 1e-12));
  const phaseDeg = (val.arg() * 180) / Math.PI;
  return { mag, magDB, phaseDeg, val };
}

// Phase unwrap
export function unwrapPhase(phases: number[]): number[] {
  const unwrapped = [phases[0]];
  for (let i = 1; i < phases.length; i++) {
    let diff = phases[i] - phases[i - 1];
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    unwrapped.push(unwrapped[i - 1] + diff);
  }
  return unwrapped;
}

// Compute Frequency Specs: wgc, PM, wpc, GM
export function computeFrequencySpecs(tf: TransferFunction): FrequencySpecs {
  // Sample frequencies logarithmically from 10^-3 to 10^4
  const N = 800;
  const wMin = 1e-3, wMax = 1e4;
  const logMin = Math.log10(wMin), logMax = Math.log10(wMax);

  const freqs: number[] = [];
  const magDBs: number[] = [];
  const rawPhases: number[] = [];

  for (let i = 0; i <= N; i++) {
    const w = Math.pow(10, logMin + (i / N) * (logMax - logMin));
    const resp = freqResp(tf, w);
    freqs.push(w);
    magDBs.push(resp.magDB);
    rawPhases.push(resp.phaseDeg);
  }

  const phases = unwrapPhase(rawPhases);

  // Find Gain Crossover (where magDB crosses 0)
  let wgc: number | null = null;
  let PM: number | null = null;
  for (let i = 0; i < N; i++) {
    if ((magDBs[i] >= 0 && magDBs[i + 1] < 0) || (magDBs[i] <= 0 && magDBs[i + 1] > 0)) {
      const frac = -magDBs[i] / (magDBs[i + 1] - magDBs[i]);
      wgc = freqs[i] + frac * (freqs[i + 1] - freqs[i]);
      const p = phases[i] + frac * (phases[i + 1] - phases[i]);
      PM = 180 + p;
      while (PM > 180) PM -= 360;
      while (PM < -180) PM += 360;
      break;
    }
  }

  // Find Phase Crossover (where phase crosses -180 deg)
  let wpc: number | null = null;
  let GM: number | null = null;
  for (let i = 0; i < N; i++) {
    const target = -180;
    if ((phases[i] >= target && phases[i + 1] < target) || (phases[i] <= target && phases[i + 1] > target)) {
      const frac = (target - phases[i]) / (phases[i + 1] - phases[i]);
      wpc = freqs[i] + frac * (freqs[i + 1] - freqs[i]);
      const m = magDBs[i] + frac * (magDBs[i + 1] - magDBs[i]);
      GM = -m; // GM = -20log10(|G(jwpc)|)
      break;
    }
  }

  const isStable = tf.poles.every(p => p.re < 0);

  return { wgc, PM, wpc, GM, isStable };
}

// Simulate Step Response using state-space companion form & RK4
export function simulateStepResponse(tf: TransferFunction, tEnd = 10, points = 500): { t: number[]; y: number[]; specs: TransientSpecs } {
  // Normalize denominator
  const den = tf.den;
  const num = tf.num;
  const a0 = den[0];
  const n = den.length - 1;

  // Align numerator to length n + 1
  const b = new Array(n + 1 - num.length).fill(0).concat(num).map(c => c / a0);
  const a = den.map(c => c / a0);

  // Direct transmission d = b[0]
  const d = b[0];
  // Control canonical state space: x_dot = A*x + B*u, y = C*x + D*u
  // C = [b_n - a_n*d, b_{n-1} - a_{n-1}*d, ...]
  const C = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    C[n - 1 - i] = b[n - i] - a[n - i] * d;
  }

  // Companion matrix derivatives function
  const ode = (x: number[], u: number): number[] => {
    const dxdt = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) {
      dxdt[i] = x[i + 1];
    }
    // Last row: -a_n*x_1 - a_{n-1}*x_2 - ... + u
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += a[n - i] * x[i];
    }
    dxdt[n - 1] = -sum + u;
    return dxdt;
  };

  // Auto-estimate appropriate tEnd based on dominant pole
  let estimatedTEnd = tEnd;
  const stablePoles = tf.poles.filter(p => p.re < -1e-4);
  if (stablePoles.length > 0) {
    const dominantRe = Math.max(...stablePoles.map(p => p.re));
    const tau = 1 / Math.abs(dominantRe);
    estimatedTEnd = Math.min(Math.max(5 * tau, 2), 50);
  }

  const dt = estimatedTEnd / points;
  const t: number[] = [];
  const y: number[] = [];
  let x = new Array(n).fill(0);

  for (let step = 0; step <= points; step++) {
    const currT = step * dt;
    t.push(currT);

    // Compute y = C*x + D*u, u = 1 (step input)
    let yVal = d * 1;
    for (let i = 0; i < n; i++) {
      yVal += C[i] * x[i];
    }
    y.push(yVal);

    // RK4 integration
    const k1 = ode(x, 1);
    const xk2 = x.map((xi, idx) => xi + 0.5 * dt * k1[idx]);
    const k2 = ode(xk2, 1);
    const xk3 = x.map((xi, idx) => xi + 0.5 * dt * k2[idx]);
    const k3 = ode(xk3, 1);
    const xk4 = x.map((xi, idx) => xi + dt * k3[idx]);
    const k4 = ode(xk4, 1);

    x = x.map((xi, idx) => xi + (dt / 6) * (k1[idx] + 2 * k2[idx] + 2 * k3[idx] + k4[idx]));
  }

  // Calculate Transient Specs
  const yss = y[y.length - 1];
  let ymax = yss;
  let tp = 0;
  for (let i = 0; i < y.length; i++) {
    if (y[i] > ymax) {
      ymax = y[i];
      tp = t[i];
    }
  }

  const Mp = yss !== 0 && ymax > yss ? ((ymax - yss) / Math.abs(yss)) * 100 : 0;

  // Rise time: 10% to 90% of yss
  let t10 = 0, t90 = 0;
  for (let i = 0; i < y.length; i++) {
    if (t10 === 0 && y[i] >= 0.1 * yss) t10 = t[i];
    if (t90 === 0 && y[i] >= 0.9 * yss) t90 = t[i];
  }
  const tr = Math.max(t90 - t10, 0);

  // Settling time (2% envelope)
  let ts = estimatedTEnd;
  for (let i = y.length - 1; i >= 0; i--) {
    if (Math.abs(y[i] - yss) > 0.02 * Math.abs(yss || 1)) {
      ts = t[i];
      break;
    }
  }

  return { t, y, specs: { tr, tp, Mp, ts, yss } };
}

// Compute Root Locus Branches
export function computeRootLocus(tf: TransferFunction): {
  branches: { k: number; roots: CNumber[] }[];
  asymptotes: { centroid: number; angles: number[] };
} {
  const num = tf.num;
  const den = tf.den;
  const n = den.length - 1;
  const m = num.length - 1;

  // Asymptotes
  const sumP = tf.poles.reduce((acc, p) => acc + p.re, 0);
  const sumZ = tf.zeros.reduce((acc, z) => acc + z.re, 0);
  const centroid = n > m ? (sumP - sumZ) / (n - m) : 0;
  const angles: number[] = [];
  if (n > m) {
    for (let k = 0; k < n - m; k++) {
      angles.push(((2 * k + 1) * 180) / (n - m));
    }
  }

  // Sample K log-spaced from 10^-3 to 10^4
  const numK = 250;
  const kMin = -3, kMax = 4;
  const branches: { k: number; roots: CNumber[] }[] = [];

  for (let i = 0; i <= numK; i++) {
    const k = Math.pow(10, kMin + (i / numK) * (kMax - kMin));
    // Characteristic equation: den(s) + K * num(s) = 0
    const charPoly = polyAdd(den, polyScale(num, k));
    const roots = findRoots(charPoly);
    branches.push({ k, roots });
  }

  return { branches, asymptotes: { centroid, angles } };
}

// Format transfer function to LaTeX
export function tfToLatex(tf: TransferFunction): string {
  const polyToLatex = (p: number[]): string => {
    const n = p.length - 1;
    if (n === 0) return `${p[0]}`;
    const terms: string[] = [];
    for (let i = 0; i <= n; i++) {
      const coeff = p[i];
      if (Math.abs(coeff) < 1e-6) continue;
      const power = n - i;
      let coeffStr = '';
      if (power === 0) {
        coeffStr = `${Math.abs(coeff).toFixed(2).replace(/\.00$/, '')}`;
      } else if (Math.abs(coeff - 1) < 1e-6) {
        coeffStr = power === 1 ? 's' : `s^{${power}}`;
      } else if (Math.abs(coeff + 1) < 1e-6) {
        coeffStr = power === 1 ? '-s' : `-s^{${power}}`;
      } else {
        const cStr = Math.abs(coeff).toFixed(2).replace(/\.00$/, '');
        coeffStr = power === 1 ? `${cStr}s` : `${cStr}s^{${power}}`;
      }

      if (terms.length === 0) {
        terms.push(coeff < 0 ? `-${coeffStr}` : coeffStr);
      } else {
        terms.push(coeff < 0 ? `- ${coeffStr}` : `+ ${coeffStr}`);
      }
    }
    return terms.join(' ') || '0';
  };

  return `\\frac{${polyToLatex(tf.num)}}{${polyToLatex(tf.den)}}`;
}
