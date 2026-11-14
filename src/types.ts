export interface Complex {
  re: number;
  im: number;
}

export class CNumber {
  re: number;
  im: number;

  constructor(re: number, im = 0) {
    this.re = re;
    this.im = im;
  }

  static from(re: number, im = 0): CNumber {
    return new CNumber(re, im);
  }

  add(other: CNumber | number): CNumber {
    const o = typeof other === 'number' ? new CNumber(other) : other;
    return new CNumber(this.re + o.re, this.im + o.im);
  }

  sub(other: CNumber | number): CNumber {
    const o = typeof other === 'number' ? new CNumber(other) : other;
    return new CNumber(this.re - o.re, this.im - o.im);
  }

  mul(other: CNumber | number): CNumber {
    const o = typeof other === 'number' ? new CNumber(other) : other;
    return new CNumber(
      this.re * o.re - this.im * o.im,
      this.re * o.im + this.im * o.re
    );
  }

  div(other: CNumber | number): CNumber {
    const o = typeof other === 'number' ? new CNumber(other) : other;
    const denom = o.re * o.re + o.im * o.im;
    if (denom === 0) return new CNumber(1e10, 0);
    return new CNumber(
      (this.re * o.re + this.im * o.im) / denom,
      (this.im * o.re - this.re * o.im) / denom
    );
  }

  abs(): number {
    return Math.hypot(this.re, this.im);
  }

  arg(): number {
    return Math.atan2(this.im, this.re);
  }

  toString(digits = 3): string {
    const r = this.re.toFixed(digits);
    const i = Math.abs(this.im).toFixed(digits);
    if (Math.abs(this.im) < 1e-4) return `${r}`;
    if (Math.abs(this.re) < 1e-4) return `${this.im < 0 ? '-' : ''}j${i}`;
    return `${r} ${this.im < 0 ? '-' : '+'} j${i}`;
  }
}

export interface TransferFunction {
  type: 'tf';
  num: number[]; // e.g. [1, 2] = s + 2
  den: number[]; // e.g. [1, 3, 2] = s^2 + 3s + 2
  poles: CNumber[];
  zeros: CNumber[];
  gain: number;
  variable: string;
}

export type PlotType = 'bode' | 'rlocus' | 'nyquist' | 'step' | 'pzmap' | 'nichols';

export interface TransientSpecs {
  tr: number; // rise time (10% to 90%)
  tp: number; // peak time
  Mp: number; // max overshoot percentage
  ts: number; // settling time (2%)
  yss: number; // steady state value
}

export interface FrequencySpecs {
  wgc: number | null; // gain crossover frequency
  PM: number | null;  // phase margin (degrees)
  wpc: number | null; // phase crossover frequency
  GM: number | null;  // gain margin (dB)
  isStable: boolean;
}

export interface ConsoleEntry {
  id: string;
  type: 'command' | 'output' | 'error' | 'info';
  text: string;
  tf?: TransferFunction;
}
