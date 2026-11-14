import { TransferFunction } from '../types';
import { createTF, feedback, conv, polyAdd, polyScale } from './math';

export interface EvalResult {
  output: string;
  activePlot?: 'bode' | 'rlocus' | 'nyquist' | 'step' | 'pzmap';
  targetTF?: TransferFunction;
  variables: Record<string, any>;
}

export class MatlabInterpreter {
  variables: Record<string, any> = {};

  constructor() {
    this.reset();
  }

  reset() {
    this.variables = {
      s: createTF([1, 0], [1]), // s = tf('s')
      pi: Math.PI,
      j: { re: 0, im: 1 },
    };
  }

  execute(code: string): EvalResult {
    const lines = code.split('\n');
    let lastOutput = '';
    let activePlot: 'bode' | 'rlocus' | 'nyquist' | 'step' | 'pzmap' | undefined;
    let targetTF: TransferFunction | undefined;

    // Split statements cleanly by newline and semicolon
    const statements: string[] = [];
    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith('%')) continue;

      // Strip trailing comment
      if (line.includes('%')) {
        line = line.split('%')[0].trim();
      }

      const parts = line.split(';').map(p => p.trim()).filter(Boolean);
      statements.push(...parts);
    }

    for (const stmt of statements) {
      // Check plot commands
      const plotMatch = stmt.match(/^(bode|rlocus|nyquist|step|pzmap|margin|damp)\s*\(([^)]+)\)/i);
      if (plotMatch) {
        const cmd = plotMatch[1].toLowerCase();
        const arg = plotMatch[2].trim();

        try {
          const tfObj = this.evalExpression(arg);

          if (tfObj && tfObj.type === 'tf') {
            targetTF = tfObj;
            if (cmd === 'bode' || cmd === 'margin') {
              activePlot = 'bode';
              lastOutput += `>> ${stmt}\nPlotting Bode Diagram for ${arg}...\n`;
            } else if (cmd === 'rlocus') {
              activePlot = 'rlocus';
              lastOutput += `>> ${stmt}\nPlotting Root Locus for ${arg}...\n`;
            } else if (cmd === 'nyquist') {
              activePlot = 'nyquist';
              lastOutput += `>> ${stmt}\nPlotting Nyquist Diagram for ${arg}...\n`;
            } else if (cmd === 'step') {
              activePlot = 'step';
              lastOutput += `>> ${stmt}\nPlotting Step Response for ${arg}...\n`;
            } else if (cmd === 'pzmap') {
              activePlot = 'pzmap';
              lastOutput += `>> ${stmt}\nPlotting Pole-Zero Map for ${arg}...\n`;
            } else if (cmd === 'damp') {
              lastOutput += `>> ${stmt}\nEigenvalue          Damping     Freq. (rad/s)\n`;
              tfObj.poles.forEach(p => {
                const wn = p.abs();
                const zeta = wn > 1e-6 ? -p.re / wn : 0;
                lastOutput += `${p.toString().padEnd(20)} ${zeta.toFixed(3).padEnd(11)} ${wn.toFixed(2)}\n`;
              });
            }
          } else {
            lastOutput += `>> ${stmt}\nWarning: '${arg}' is not a valid transfer function.\n`;
          }
        } catch (e: any) {
          lastOutput += `>> ${stmt}\nError in ${cmd}: ${e.message}\n`;
        }
        continue;
      }

      // Check variable assignment: var = expr
      const assignMatch = stmt.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
      if (assignMatch) {
        const varName = assignMatch[1];
        const expr = assignMatch[2].trim();

        try {
          const val = this.evalExpression(expr);
          this.variables[varName] = val;

          if (val && val.type === 'tf') {
            targetTF = val;
            lastOutput += `${varName} =\n\n  Transfer function:\n  ${this.formatTF(val)}\n\n`;
          } else if (typeof val === 'number') {
            lastOutput += `${varName} =\n    ${val}\n\n`;
          } else {
            lastOutput += `${varName} = [computed]\n\n`;
          }
        } catch (e: any) {
          lastOutput += `Error evaluating '${stmt}': ${e.message}\n`;
        }
        continue;
      }

      // Standalone expression
      try {
        const val = this.evalExpression(stmt);
        this.variables['ans'] = val;
        if (val && val.type === 'tf') {
          targetTF = val;
          lastOutput += `ans =\n\n  Transfer function:\n  ${this.formatTF(val)}\n\n`;
        } else if (typeof val === 'number') {
          lastOutput += `ans =\n    ${val}\n\n`;
        }
      } catch (e: any) {
        lastOutput += `Error: ${e.message}\n`;
      }
    }

    return {
      output: lastOutput.trim() || 'Command executed successfully.',
      activePlot,
      targetTF,
      variables: this.variables
    };
  }

  // Expression evaluator
  evalExpression(expr: string): any {
    expr = expr.trim();
    if (!expr) return 0;

    // Remove wrapping parentheses if redundant: ((s+1)) -> (s+1)
    while (expr.startsWith('(') && expr.endsWith(')') && this.isMatchingParen(expr.slice(1, -1))) {
      expr = expr.slice(1, -1).trim();
    }

    // tf('s')
    if (/^tf\s*\(\s*['"]s['"]\s*\)$/i.test(expr)) {
      return createTF([1, 0], [1]);
    }

    // tf([num], [den])
    const tfExplicit = expr.match(/^tf\s*\(\s*\[([^\]]+)\]\s*,\s*\[([^\]]+)\]\s*\)$/i);
    if (tfExplicit) {
      const num = tfExplicit[1].split(/[,\s]+/).filter(Boolean).map(Number);
      const den = tfExplicit[2].split(/[,\s]+/).filter(Boolean).map(Number);
      return createTF(num, den);
    }

    // feedback(G, H)
    const fbMatch = expr.match(/^feedback\s*\(([^,]+)(?:,\s*([^)]+))?\)$/i);
    if (fbMatch) {
      const g = this.evalExpression(fbMatch[1]);
      const h = fbMatch[2] ? this.evalExpression(fbMatch[2]) : 1;
      return feedback(g, h);
    }

    // Numeric literal
    if (!isNaN(Number(expr))) {
      return Number(expr);
    }

    // Single variable lookup
    if (this.variables[expr] !== undefined) {
      return this.variables[expr];
    }

    // Addition / Subtraction (lowest precedence, split outside parens)
    const addSubIdx = this.findLowestPrecedenceOp(expr, ['+', '-']);
    if (addSubIdx !== -1) {
      const op = expr[addSubIdx];
      const left = this.evalExpression(expr.slice(0, addSubIdx));
      const right = this.evalExpression(expr.slice(addSubIdx + 1));
      return op === '+' ? this.add(left, right) : this.subtract(left, right);
    }

    // Division / Multiplication
    const mulDivIdx = this.findLowestPrecedenceOp(expr, ['*', '/']);
    if (mulDivIdx !== -1) {
      const op = expr[mulDivIdx];
      const left = this.evalExpression(expr.slice(0, mulDivIdx));
      const right = this.evalExpression(expr.slice(mulDivIdx + 1));
      return op === '*' ? this.multiply(left, right) : this.divide(left, right);
    }

    // Power operator: expr ^ n
    const powIdx = this.findLowestPrecedenceOp(expr, ['^']);
    if (powIdx !== -1) {
      const base = this.evalExpression(expr.slice(0, powIdx));
      const exp = this.evalExpression(expr.slice(powIdx + 1));
      return this.power(base, exp);
    }

    // Support implicit multiplication e.g. 2s -> 2*s, 5G -> 5*G
    const implicitMatch = expr.match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (implicitMatch) {
      const num = Number(implicitMatch[1]);
      const v = this.evalExpression(implicitMatch[2]);
      return this.multiply(num, v);
    }

    throw new Error(`Cannot parse expression '${expr}'`);
  }

  private isMatchingParen(s: string): boolean {
    let depth = 0;
    for (const c of s) {
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth < 0) return false;
      }
    }
    return depth === 0;
  }

  private findLowestPrecedenceOp(expr: string, ops: string[]): number {
    let depth = 0;
    for (let i = expr.length - 1; i >= 0; i--) {
      const ch = expr[i];
      if (ch === ')') depth++;
      else if (ch === '(') depth--;
      else if (depth === 0 && ops.includes(ch)) {
        if (ch === '-' && (i === 0 || ['+', '-', '*', '/', '^', '('].includes(expr[i - 1].trim()))) {
          continue;
        }
        return i;
      }
    }
    return -1;
  }

  power(base: any, exp: any): any {
    const n = typeof exp === 'number' ? Math.round(exp) : 1;
    if (typeof base === 'number') {
      return Math.pow(base, n);
    }
    if (base && base.type === 'tf') {
      if (n === 0) return createTF([1], [1]);
      let res = base;
      for (let i = 1; i < n; i++) {
        res = this.multiply(res, base);
      }
      return res;
    }
    return base;
  }

  multiply(a: any, b: any): any {
    if (typeof a === 'number' && typeof b === 'number') return a * b;
    if (typeof a === 'number' && b?.type === 'tf') {
      return createTF(polyScale(b.num, a), b.den);
    }
    if (a?.type === 'tf' && typeof b === 'number') {
      return createTF(polyScale(a.num, b), a.den);
    }
    if (a?.type === 'tf' && b?.type === 'tf') {
      return createTF(conv(a.num, b.num), conv(a.den, b.den));
    }
    return 0;
  }

  divide(a: any, b: any): any {
    if (typeof a === 'number' && typeof b === 'number') return a / b;
    if (typeof a === 'number' && b?.type === 'tf') {
      return createTF(polyScale(b.den, a), b.num);
    }
    if (a?.type === 'tf' && typeof b === 'number') {
      return createTF(a.num, polyScale(a.den, b));
    }
    if (a?.type === 'tf' && b?.type === 'tf') {
      return createTF(conv(a.num, b.den), conv(a.den, b.num));
    }
    return 0;
  }

  add(a: any, b: any): any {
    if (typeof a === 'number' && typeof b === 'number') return a + b;
    if (typeof a === 'number' && b?.type === 'tf') {
      const newNum = polyAdd(polyScale(b.den, a), b.num);
      return createTF(newNum, b.den);
    }
    if (a?.type === 'tf' && typeof b === 'number') {
      const newNum = polyAdd(a.num, polyScale(a.den, b));
      return createTF(newNum, a.den);
    }
    if (a?.type === 'tf' && b?.type === 'tf') {
      const t1 = conv(a.num, b.den);
      const t2 = conv(b.num, a.den);
      return createTF(polyAdd(t1, t2), conv(a.den, b.den));
    }
    return 0;
  }

  subtract(a: any, b: any): any {
    return this.add(a, this.multiply(-1, b));
  }

  private formatTF(tf: TransferFunction): string {
    const polyToStr = (p: number[]) => {
      const n = p.length - 1;
      if (n === 0) return `${p[0]}`;
      const terms: string[] = [];
      for (let i = 0; i <= n; i++) {
        const c = p[i];
        if (Math.abs(c) < 1e-6) continue;
        const power = n - i;
        const cStr = Math.abs(c) === 1 && power > 0 ? '' : Math.abs(c).toFixed(2).replace(/\.00$/, '');
        const pStr = power === 0 ? cStr : power === 1 ? `${cStr}s` : `${cStr}s^${power}`;
        if (terms.length === 0) {
          terms.push(c < 0 ? `-${pStr}` : pStr);
        } else {
          terms.push(c < 0 ? `- ${pStr}` : `+ ${pStr}`);
        }
      }
      return terms.join(' ') || '0';
    };

    const numStr = polyToStr(tf.num);
    const denStr = polyToStr(tf.den);
    const maxLen = Math.max(numStr.length, denStr.length) + 4;
    const padNum = ' '.repeat(Math.max(0, Math.floor((maxLen - numStr.length) / 2))) + numStr;
    const bar = '-'.repeat(maxLen);
    const padDen = ' '.repeat(Math.max(0, Math.floor((maxLen - denStr.length) / 2))) + denStr;

    return `${padNum}\n  ${bar}\n  ${padDen}`;
  }
}
