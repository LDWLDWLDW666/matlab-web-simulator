import React, { useEffect, useRef, useState } from 'react';
import { TransferFunction } from '../../types';
import { computeFrequencySpecs, freqResp, unwrapPhase } from '../../utils/math';

interface Props {
  tf: TransferFunction;
}

export const BodePlot: React.FC<Props> = ({ tf }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ w: number; magDB: number; phase: number } | null>(null);
  const specs = computeFrequencySpecs(tf);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina support
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    // Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    // Layout: Two subplots (Top: Magnitude, Bottom: Phase)
    const margin = { top: 30, right: 35, bottom: 45, left: 65 };
    const gap = 35;
    const subH = (H - margin.top - margin.bottom - gap) / 2;

    const wMin = 1e-2;
    const wMax = 1e3;
    const logMin = Math.log10(wMin);
    const logMax = Math.log10(wMax);

    // Compute data
    const N = 400;
    const freqs: number[] = [];
    const mags: number[] = [];
    const rawPhases: number[] = [];

    for (let i = 0; i <= N; i++) {
      const w = Math.pow(10, logMin + (i / N) * (logMax - logMin));
      const resp = freqResp(tf, w);
      freqs.push(w);
      mags.push(resp.magDB);
      rawPhases.push(resp.phaseDeg);
    }
    const phases = unwrapPhase(rawPhases);

    // Scales
    const magMin = Math.floor(Math.min(...mags, -40) / 20) * 20;
    const magMax = Math.ceil(Math.max(...mags, 20) / 20) * 20;
    const phaseMin = Math.floor(Math.min(...phases, -270) / 45) * 45;
    const phaseMax = Math.ceil(Math.max(...phases, 0) / 45) * 45;

    const xToPx = (w: number) => margin.left + ((Math.log10(w) - logMin) / (logMax - logMin)) * (W - margin.left - margin.right);
    const magToPx = (m: number) => margin.top + (1 - (m - magMin) / (magMax - magMin)) * subH;
    const phaseToPx = (p: number) => margin.top + subH + gap + (1 - (p - phaseMin) / (phaseMax - phaseMin)) * subH;

    // Draw Grid & Axes for both subplots
    const drawGrid = (yMin: number, yMax: number, step: number, toYPx: (val: number) => number, topY: number, title: string, unit: string) => {
      // Background box
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(margin.left, topY, W - margin.left - margin.right, subH);

      // Subplot title
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${title} (${unit})`, margin.left + 8, topY + 18);

      // Y grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let val = yMin; val <= yMax; val += step) {
        const y = toYPx(val);
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(W - margin.right, y);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '11px "Fira Code", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${val}`, margin.left - 8, y + 4);
      }

      // X log grid
      for (let dec = Math.floor(logMin); dec <= Math.ceil(logMax); dec++) {
        for (let mult = 1; mult < 10; mult++) {
          const w = mult * Math.pow(10, dec);
          if (w < wMin || w > wMax) continue;
          const x = xToPx(w);
          ctx.beginPath();
          ctx.moveTo(x, topY);
          ctx.lineTo(x, topY + subH);
          ctx.strokeStyle = mult === 1 ? '#334155' : '#141e33';
          ctx.stroke();

          if (mult === 1 && topY > margin.top) {
            ctx.fillStyle = '#64748b';
            ctx.font = '11px "Fira Code", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`10^${dec}`, x, topY + subH + 16);
          }
        }
      }

      // Border
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(margin.left, topY, W - margin.left - margin.right, subH);
    };

    // Subplot 1: Magnitude
    drawGrid(magMin, magMax, 20, magToPx, margin.top, 'Magnitude', 'dB');
    // 0 dB line highlight
    if (magMin <= 0 && magMax >= 0) {
      const y0 = magToPx(0);
      ctx.strokeStyle = '#e2e8f0';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, y0);
      ctx.lineTo(W - margin.right, y0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Subplot 2: Phase
    drawGrid(phaseMin, phaseMax, 45, phaseToPx, margin.top + subH + gap, 'Phase', 'deg');
    // -180 deg line highlight
    if (phaseMin <= -180 && phaseMax >= -180) {
      const y180 = phaseToPx(-180);
      ctx.strokeStyle = '#ef4444';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(margin.left, y180);
      ctx.lineTo(W - margin.right, y180);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Plot Magnitude curve
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = xToPx(freqs[i]);
      const y = magToPx(mags[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Plot Phase curve
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = xToPx(freqs[i]);
      const y = phaseToPx(phases[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Annotate wgc & PM
    if (specs.wgc && specs.PM !== null) {
      const xG = xToPx(specs.wgc);
      // Vertical line across both plots
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xG, margin.top);
      ctx.lineTo(xG, margin.top + subH * 2 + gap);
      ctx.stroke();
      ctx.setLineDash([]);

      // PM bar on Phase plot
      const y180 = phaseToPx(-180);
      const yP = phaseToPx(-180 + specs.PM);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(xG, y180);
      ctx.lineTo(xG, yP);
      ctx.stroke();

      // Dot & Badge
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(xG, yP, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Annotate wpc & GM
    if (specs.wpc && specs.GM !== null) {
      const xP = xToPx(specs.wpc);
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(xP, margin.top);
      ctx.lineTo(xP, margin.top + subH * 2 + gap);
      ctx.stroke();
      ctx.setLineDash([]);

      // GM bar on Mag plot
      const y0 = magToPx(0);
      const yM = magToPx(-specs.GM);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(xP, y0);
      ctx.lineTo(xP, yM);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(xP, yM, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // X Axis Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (rad/s)', margin.left + (W - margin.left - margin.right) / 2, H - 12);

  }, [tf]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">Bode Diagram (頻率響應波德圖)</span>
          <span className="text-sky-400">― 幅值 (dB)</span>
          <span className="text-amber-400">― 相位 (deg)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            ωgc = <strong className="text-sky-400">{specs.wgc ? specs.wgc.toFixed(2) : 'N/A'}</strong> rad/s
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            PM = <strong className={specs.PM && specs.PM > 0 ? "text-emerald-400" : "text-rose-400"}>{specs.PM !== null ? `${specs.PM.toFixed(1)}°` : '∞'}</strong>
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            GM = <strong className={specs.GM && specs.GM > 0 ? "text-emerald-400" : "text-rose-400"}>{specs.GM !== null ? `${specs.GM.toFixed(1)} dB` : '∞'}</strong>
          </span>
          <span className={`px-2 py-0.5 rounded font-bold ${specs.isStable ? "bg-emerald-950 text-emerald-400 border border-emerald-700" : "bg-rose-950 text-rose-400 border border-rose-700"}`}>
            {specs.isStable ? "開迴路穩定" : "開迴路不穩定"}
          </span>
        </div>
      </div>
      <div className="flex-1 w-full relative">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
};
