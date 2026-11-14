import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction, CNumber } from '../../types';
import { computeRootLocus, findRoots, polyAdd, polyScale } from '../../utils/math';

interface Props {
  tf: TransferFunction;
}

export const RootLocusPlot: React.FC<Props> = ({ tf }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gainK, setGainK] = useState<number>(1.0);
  const [closedLoopPoles, setClosedLoopPoles] = useState<CNumber[]>([]);

  const { branches, asymptotes } = useMemo(() => computeRootLocus(tf), [tf]);

  // Compute closed loop poles for current gain K
  useEffect(() => {
    try {
      const charPoly = polyAdd(tf.den, polyScale(tf.num, gainK));
      const roots = findRoots(charPoly);
      setClosedLoopPoles(roots);
    } catch (e) {
      console.error(e);
    }
  }, [tf, gainK]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width <= 10 || rect.height <= 10) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    // Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    // Calculate bounding box for s-plane
    let minSigma = -6, maxSigma = 2, maxOmega = 5;
    const allRoots = branches.flatMap(b => b.roots).concat(tf.poles).concat(tf.zeros);
    if (allRoots.length > 0) {
      const sigmas = allRoots.map(r => r.re).filter(v => isFinite(v) && Math.abs(v) < 100);
      const omegas = allRoots.map(r => Math.abs(r.im)).filter(v => isFinite(v) && Math.abs(v) < 100);
      if (sigmas.length > 0) {
        minSigma = Math.min(...sigmas, -4);
        maxSigma = Math.max(...sigmas, 1.5);
      }
      if (omegas.length > 0) {
        maxOmega = Math.max(...omegas, 3);
      }
    }
    // Margin
    minSigma = Math.floor(minSigma - 1);
    maxSigma = Math.ceil(maxSigma + 1);
    maxOmega = Math.ceil(maxOmega + 1);

    const pad = 50;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    const xToPx = (sigma: number) => pad + ((sigma - minSigma) / (maxSigma - minSigma)) * plotW;
    const yToPx = (omega: number) => pad + ((maxOmega - omega) / (2 * maxOmega)) * plotH;

    // Background area
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pad, pad, plotW, plotH);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let s = minSigma; s <= maxSigma; s += 1) {
      const x = xToPx(s);
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, pad + plotH);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '11px "Fira Code", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${s}`, x, yToPx(0) + 16);
    }
    for (let o = -maxOmega; o <= maxOmega; o += 1) {
      if (o === 0) continue;
      const y = yToPx(o);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + plotW, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '11px "Fira Code", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${o > 0 ? `+j${o}` : `-j${Math.abs(o)}`}`, xToPx(0) - 8, y + 4);
    }

    // Axes
    const x0 = xToPx(0);
    const y0 = yToPx(0);

    // Real axis (sigma)
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, y0);
    ctx.lineTo(pad + plotW, y0);
    ctx.stroke();

    // Imaginary axis (j omega)
    ctx.strokeStyle = '#ef4444'; // Red for stability boundary
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, pad);
    ctx.lineTo(x0, pad + plotH);
    ctx.stroke();

    // Stable half-plane label
    ctx.fillStyle = '#10b981';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('← 穩定區 (LHP)', pad + 10, pad + 20);

    ctx.fillStyle = '#f43f5e';
    ctx.textAlign = 'right';
    ctx.fillText('不穩定區 (RHP) →', pad + plotW - 10, pad + 20);

    // Draw Asymptotes
    if (asymptotes.angles.length > 0) {
      const ax = xToPx(asymptotes.centroid);
      const r = Math.max(plotW, plotH);
      ctx.strokeStyle = '#a855f7';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;

      asymptotes.angles.forEach(ang => {
        const rad = (ang * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(ax, y0);
        ctx.lineTo(ax + r * Math.cos(rad), y0 - r * Math.sin(rad));
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // Draw Root Locus Trajectories
    // Group roots across K by proximity
    const numRoots = tf.den.length - 1;
    const paths: CNumber[][] = Array.from({ length: numRoots }, () => []);

    branches.forEach((b, bIdx) => {
      if (bIdx === 0) {
        b.roots.forEach((r, idx) => paths[idx]?.push(r));
      } else {
        const prev = branches[bIdx - 1].roots;
        // Match nearest
        const used = new Set<number>();
        prev.forEach((pr, pIdx) => {
          let bestIdx = -1;
          let bestDist = Infinity;
          b.roots.forEach((nr, nIdx) => {
            if (!used.has(nIdx)) {
              const d = Math.hypot(pr.re - nr.re, pr.im - nr.im);
              if (d < bestDist) {
                bestDist = d;
                bestIdx = nIdx;
              }
            }
          });
          if (bestIdx !== -1) {
            used.add(bestIdx);
            paths[pIdx]?.push(b.roots[bestIdx]);
          }
        });
      }
    });

    // Stroke locus paths
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;
    paths.forEach(path => {
      ctx.beginPath();
      let started = false;
      path.forEach(pt => {
        if (!isFinite(pt.re) || !isFinite(pt.im)) return;
        const x = xToPx(pt.re);
        const y = yToPx(pt.im);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });

    // Draw Open Loop Zeros (o)
    tf.zeros.forEach(z => {
      const zx = xToPx(z.re);
      const zy = yToPx(z.im);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(zx, zy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Draw Open Loop Poles (x)
    tf.poles.forEach(p => {
      const px = xToPx(p.re);
      const py = yToPx(p.im);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px - 5, py - 5);
      ctx.lineTo(px + 5, py + 5);
      ctx.moveTo(px + 5, py - 5);
      ctx.lineTo(px - 5, py + 5);
      ctx.stroke();
    });

    // Draw Current Closed Loop Poles for gain K (magenta squares)
    closedLoopPoles.forEach(clp => {
      const cx = xToPx(clp.re);
      const cy = yToPx(clp.im);
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 5, cy - 5, 10, 10);
    });

    // Border
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(pad, pad, plotW, plotH);

  }, [tf, branches, asymptotes, closedLoopPoles]);

  const dominantPole = closedLoopPoles.reduce<CNumber | null>((dom, p) => {
    if (!dom || p.re > dom.re) return p;
    return dom;
  }, null);

  const wn = dominantPole ? dominantPole.abs() : 0;
  const zeta = wn > 1e-6 && dominantPole ? -dominantPole.re / wn : 0;
  const isClosedLoopStable = closedLoopPoles.every(p => p.re < 0);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">Root Locus (根軌跡圖)</span>
          <span className="text-sky-400">✕ 開迴路極點 (K=0)</span>
          <span className="text-amber-400">○ 開迴路零點</span>
          <span className="text-pink-400">■ 閉迴路極點 (目前 K)</span>
          <span className="text-purple-400">- - 漸近線</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            漸近線交點 σa = <strong className="text-purple-400">{asymptotes.centroid.toFixed(2)}</strong>
          </span>
          <span className={`px-2 py-0.5 rounded font-bold ${isClosedLoopStable ? "bg-emerald-950 text-emerald-400 border border-emerald-700" : "bg-rose-950 text-rose-400 border border-rose-700"}`}>
            {isClosedLoopStable ? `閉迴路穩定 (K=${gainK.toFixed(2)})` : `閉迴路不穩定 (K=${gainK.toFixed(2)})`}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Gain Slider Footer */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950 border-t border-slate-800 text-xs">
        <div className="flex items-center gap-3 w-1/2">
          <span className="font-semibold text-slate-300 whitespace-nowrap">動態迴路增益 K:</span>
          <input
            type="range"
            min="0.05"
            max="50"
            step="0.05"
            value={gainK}
            onChange={e => setGainK(parseFloat(e.target.value))}
            className="w-full accent-pink-500 cursor-pointer"
          />
          <span className="font-mono text-pink-400 font-bold w-12">{gainK.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>主導極點 s = <strong className="text-slate-200 font-mono">{dominantPole?.toString() || 'N/A'}</strong></span>
          <span>阻尼比 ζ = <strong className="text-emerald-400 font-mono">{zeta.toFixed(3)}</strong></span>
          <span>自然頻率 ωn = <strong className="text-sky-400 font-mono">{wn.toFixed(2)}</strong> rad/s</span>
        </div>
      </div>
    </div>
  );
};
