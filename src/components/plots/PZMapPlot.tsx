import React, { useEffect, useRef } from 'react';
import { TransferFunction } from '../../types';

interface Props {
  tf: TransferFunction;
}

export const PZMapPlot: React.FC<Props> = ({ tf }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    const pad = 45;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    // Calculate extent
    const pts = [...tf.poles, ...tf.zeros];
    let maxR = 6;
    if (pts.length > 0) {
      const maxVal = Math.max(...pts.map(p => Math.hypot(p.re, p.im)));
      if (maxVal > 0) maxR = Math.ceil(maxVal * 1.4);
    }

    const cx = pad + plotW * 0.7; // Place imaginary axis slightly to the right so LHP has more room
    const cy = pad + plotH / 2;
    const ppu = (Math.min(plotW, plotH) / 2) / maxR;

    const toPxX = (sigma: number) => cx + sigma * ppu;
    const toPxY = (omega: number) => cy - omega * ppu;

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pad, pad, plotW, plotH);

    // Constant wn circles
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let wn = 1; wn <= maxR; wn += Math.max(1, Math.floor(maxR / 5))) {
      ctx.beginPath();
      ctx.arc(cx, cy, wn * ppu, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.font = '10px "Fira Code", monospace';
      ctx.fillText(`ωn=${wn}`, cx - wn * ppu - 4, cy - 6);
    }

    // Constant zeta radial lines (0.2, 0.4, 0.6, 0.8)
    const zetas = [0.2, 0.4, 0.6, 0.8];
    zetas.forEach(z => {
      const theta = Math.acos(z); // angle from negative real axis
      const radL = maxR * ppu;
      ctx.strokeStyle = '#1e293b';
      ctx.setLineDash([2, 4]);

      // Upper radial line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - radL * Math.cos(theta), cy - radL * Math.sin(theta));
      ctx.stroke();

      // Lower radial line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - radL * Math.cos(theta), cy + radL * Math.sin(theta));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#475569';
      ctx.font = '10px "Fira Code", monospace';
      ctx.fillText(`ζ=${z}`, cx - radL * Math.cos(theta) - 10, cy - radL * Math.sin(theta) - 4);
    });

    // Axes
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, cy);
    ctx.lineTo(pad + plotW, cy);
    ctx.moveTo(cx, pad);
    ctx.lineTo(cx, pad + plotH);
    ctx.stroke();

    // Stability Boundary highlight
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, pad);
    ctx.lineTo(cx, pad + plotH);
    ctx.stroke();

    // Draw Zeros (o)
    tf.zeros.forEach(z => {
      const x = toPxX(z.re);
      const y = toPxY(z.im);
      ctx.strokeStyle = '#f59e0b';
      ctx.fillStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.font = '11px "Fira Code", monospace';
      ctx.fillText(`(${z.re.toFixed(2)}, ${z.im.toFixed(2)})`, x + 10, y - 4);
    });

    // Draw Poles (x)
    tf.poles.forEach(p => {
      const x = toPxX(p.re);
      const y = toPxY(p.im);
      ctx.strokeStyle = p.re < 0 ? '#38bdf8' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.moveTo(x + 6, y - 6);
      ctx.lineTo(x - 6, y + 6);
      ctx.stroke();

      ctx.fillStyle = p.re < 0 ? '#38bdf8' : '#ef4444';
      ctx.font = '11px "Fira Code", monospace';
      ctx.fillText(`(${p.re.toFixed(2)}, ${p.im.toFixed(2)})`, x + 10, y - 4);
    });

    // Border
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(pad, pad, plotW, plotH);

  }, [tf]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">Pole-Zero Map (極零點分佈圖 pzmap)</span>
          <span className="text-sky-400">✕ 穩定極點 (LHP)</span>
          <span className="text-rose-400">✕ 不穩定極點 (RHP)</span>
          <span className="text-amber-400">○ 零點</span>
          <span className="text-slate-400">- - 恆等阻尼線 (ζ)</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            極點數: <strong className="text-sky-400">{tf.poles.length}</strong>
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            零點數: <strong className="text-amber-400">{tf.zeros.length}</strong>
          </span>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
};
