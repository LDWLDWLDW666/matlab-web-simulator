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

    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith('%')) continue;

      // Strip comments
      if (line.includes('%')) {
        line = line.split('%')[0].trim();
      }

      // Check plot commands
      const plotMatch = line.match(/^(bode|rlocus|nyquist|step|pzmap|margin|damp)\s*\(([^)]+)\)/i);
      if (plotMatch) {
        const cmd = plotMatch[1].toLowerCase();
        const arg = plotMatch[2].trim();
        const tfObj = this.evalExpression(arg);

        if (tfObj && tfObj.type === 'tf') {
          targetTF = tfObj;
          if (cmd === 'bode' || cmd === 'margin') {
            activePlot = 'bode';
            lastOutput += `>> ${line}\nPlotting Bode Diagram for ${arg}...\n`;
          } else if (cmd === 'rlocus') {
            activePlot = 'rlocus';
            lastOutput += `>> ${line}\nPlotting Root Locus for ${arg}...\n`;
          } else if (cmd === 'nyquist') {
            activePlot = 'nyquist';
            lastOutput += `>> ${line}\nPlotting Nyquist Diagram for ${arg}...\n`;
          } else if (cmd === 'step') {
            activePlot = 'step';
            lastOutput += `>> ${line}\nPlotting Step Response for ${arg}...\n`;
          } else if (cmd === 'pzmap') {
            activePlot = 'pzmap';
            lastOutput += `>> ${line}\nPlotting Pole-Zero Map for ${arg}...\n`;
          } else if (cmd === 'damp') {
            lastOutput += `>> ${line}\nEigenvalue          Damping     Freq. (rad/s)\n`;
            tfObj.poles.forEach(p => {
              const wn = p.abs();
              const zeta = wn > 1e-6 ? -p.re / wn : 0;
              lastOutput += `${p.toString().padEnd(20)} ${zeta.toFixed(3).padEnd(11)} ${wn.toFixed(2)}\n`;
            });
          }
        } else {
          lastOutput += `>> ${line}\nError: Argument '${arg}' is not a valid transfer function.\n`;
        }
        continue;
      }

      // Check variable assignment: var = expr
      const assignMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
      if (assignMatch) {
        const varName = assignMatch[1];
        const expr = assignMatch[2].replace(/;$/, '').trim();

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
          lastOutput += `Error evaluating '${line}': ${e.message}\n`;
        }
        continue;
      }

      // Standalone expression
      try {
        const val = this.evalExpression(line.replace(/;$/, ''));
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

    // Division: A / B
    const divIdx = this.findTopLevelOperator(expr, '/');
    if (divIdx !== -1) {
      const left = this.evalExpression(expr.slice(0, divIdx));
      const right = this.evalExpression(expr.slice(divIdx + 1));
      return this.divide(left, right);
    }

    // Addition / Subtraction: A + B or A - B
    const addSubIdx = this.findTopLevelOperator(expr, '+') !== -1 
      ? this.findTopLevelOperator(expr, '+') 
      : this.findTopLevelOperator(expr, '-');
    if (addSubIdx !== -1) {
      const op = expr[addSubIdx];
      const left = this.evalExpression(expr.slice(0, addSubIdx));
      const right = this.evalExpression(expr.slice(addSubIdx + 1));
      return op === '+' ? this.add(left, right) : this.subtract(left, right);
    }

    // Multiplication: A * B
    const mulIdx = this.findTopLevelOperator(expr, '*');
    if (mulIdx !== -1) {
      const left = this.evalExpression(expr.slice(0, mulIdx));
      const right = this.evalExpression(expr.slice(mulIdx + 1));
      return this.multiply(left, right);
    }

    // Parentheses (expr)
    if (expr.startsWith('(') && expr.endsWith(')')) {
      return this.evalExpression(expr.slice(1, -1));
    }

    throw new Error(`Cannot parse expression '${expr}'`);
  }

  // Find operator not enclosed in parentheses
  private findTopLevelOperator(expr: string, op: string): number {
    let depth = 0;
    // Search from right to left for left-associativity
    for (let i = expr.length - 1; i >= 0; i--) {
      const ch = expr[i];
      if (ch === ')') depth++;
      else if (ch === '(') depth--;
      else if (depth === 0 && ch === op) {
        // Ensure it's not a leading negative sign
        if (op === '-' && (i === 0 || ['+', '-', '*', '/', '('].includes(expr[i - 1].trim()))) {
          continue;
        }
        return i;
      }
    }
    return -1;
  }

  private multiply(a: any, b: any): any {
    if (typeof a === 'number' && typeof b === 'number') return a * b;
    if (typeof a === 'number' && b.type === 'tf') {
      return createTF(polyScale(b.num, a), b.den);
    }
    if (a.type === 'tf' && typeof b === 'number') {
      return createTF(polyScale(a.num, b), a.den);
    }
    if (a.type === 'tf' && b.type === 'tf') {
      return createTF(conv(a.num, b.num), conv(a.den, b.den));
    }
    return 0;
  }

  private divide(a: any, b: any): any {
    if (typeof a === 'number' && typeof b === 'number') return a / b;
    if (typeof a === 'number' && b.type === 'tf') {
      return createTF(polyScale(b.den, a), b.num);
    }
    if (a.type === 'tf' && typeof b === 'number') {
      return createTF(a.num, polyScale(a.den, b));
    }
    if (a.type === 'tf' && b.type === 'tf') {
      return createTF(conv(a.num, b.den), conv(a.den, b.num));
    }
    return 0;
  }

  private add(a: any, b: any): any {
    if (typeof a === 'number' && typeof b === 'number') return a + b;
    if (typeof a === 'number' && b.type === 'tf') {
      // a + N/D = (a*D + N)/D
      const newNum = polyAdd(polyScale(b.den, a), b.num);
      return createTF(newNum, b.den);
    }
    if (a.type === 'tf' && typeof b === 'number') {
      const newNum = polyAdd(a.num, polyScale(a.den, b));
      return createTF(newNum, a.den);
    }
    if (a.type === 'tf' && b.type === 'tf') {
      // N1/D1 + N2/D2 = (N1*D2 + N2*D1) / (D1*D2)
      const t1 = conv(a.num, b.den);
      const t2 = conv(b.num, a.den);
      return createTF(polyAdd(t1, t2), conv(a.den, b.den));
    }
    return 0;
  }

  private subtract(a: any, b: any): any {
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
