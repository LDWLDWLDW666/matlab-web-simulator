import React, { useEffect, useRef, useState } from 'react';
import { TransferFunction, CNumber } from '../../types';
import { freqResp } from '../../utils/math';

interface Props {
  tf: TransferFunction;
}

export const NyquistPlot: React.FC<Props> = ({ tf }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sensitivityR, setSensitivityR] = useState<number>(0.1288); // 115 UST default
  const [showSensitivity, setShowSensitivity] = useState<boolean>(true);
  const [zoomScale, setZoomScale] = useState<number>(1.0);

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

    // Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    const pad = 40;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    // Center point (0, 0)
    const cx = pad + plotW / 2;
    const cy = pad + plotH / 2;

    // Base scale (pixels per unit)
    const basePPU = (Math.min(plotW, plotH) / 4) * zoomScale;

    const toPxX = (re: number) => cx + re * basePPU;
    const toPxY = (im: number) => cy - im * basePPU;

    // Background area
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pad, pad, plotW, plotH);

    // Grid circles (unit circle, 2, 3)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let r = 1; r <= 6; r++) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * basePPU, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, cy);
    ctx.lineTo(pad + plotW, cy);
    ctx.moveTo(cx, pad);
    ctx.lineTo(cx, pad + plotH);
    ctx.stroke();

    // Critical point (-1, 0)
    const critX = toPxX(-1);
    const critY = toPxY(0);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(critX - 7, critY - 7);
    ctx.lineTo(critX + 7, critY + 7);
    ctx.moveTo(critX + 7, critY - 7);
    ctx.lineTo(critX - 7, critY + 7);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('(-1, j0)', critX, critY + 20);

    // Sensitivity Circle centered at (-1, 0) with radius r0 (115 UST P3)
    if (showSensitivity && sensitivityR > 0) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(critX, critY, sensitivityR * basePPU, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#10b981';
      ctx.font = '11px "Fira Code", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`感度圓 r₀ = ${sensitivityR.toFixed(4)}`, critX + sensitivityR * basePPU + 6, critY - 6);
    }

    // Sample frequencies for Nyquist contour
    const N = 600;
    const wMin = 1e-2, wMax = 1e3;
    const logMin = Math.log10(wMin), logMax = Math.log10(wMax);

    const posPts: { x: number; y: number }[] = [];
    const negPts: { x: number; y: number }[] = [];

    let minDistanceToMinusOne = Infinity;

    for (let i = 0; i <= N; i++) {
      const w = Math.pow(10, logMin + (i / N) * (logMax - logMin));
      const resp = freqResp(tf, w);
      const re = resp.val.re;
      const im = resp.val.im;

      // Distance to (-1, 0)
      const dist = Math.hypot(re - (-1), im - 0);
      minDistanceToMinusOne = Math.min(minDistanceToMinusOne, dist);

      posPts.push({ x: toPxX(re), y: toPxY(im) });
      negPts.push({ x: toPxX(re), y: toPxY(-im) }); // Conjugate for w < 0
    }

    // Draw Positive Frequency Curve (Solid Blue)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    posPts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Draw Negative Frequency Curve (Dashed Sky Blue)
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    negPts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw directional arrows along positive curve
    const arrowIndices = [Math.floor(N * 0.2), Math.floor(N * 0.5), Math.floor(N * 0.8)];
    arrowIndices.forEach(idx => {
      if (idx < posPts.length - 1) {
        const p1 = posPts[idx];
        const p2 = posPts[idx + 1];
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x - 10 * Math.cos(angle - Math.PI / 6), p1.y - 10 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(p1.x - 10 * Math.cos(angle + Math.PI / 6), p1.y - 10 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    });

    // Border
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(pad, pad, plotW, plotH);

  }, [tf, sensitivityR, showSensitivity, zoomScale]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">Nyquist Diagram (奈氏圖)</span>
          <span className="text-sky-400">― 正頻率 (ω &gt; 0)</span>
          <span className="text-sky-600">- - 負頻率 (ω &lt; 0)</span>
          <span className="text-rose-400">✕ 臨界點 (-1, j0)</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showSensitivity}
              onChange={e => setShowSensitivity(e.target.checked)}
              className="accent-emerald-500 rounded"
            />
            感度圓 (Sensitivity Circle)
          </label>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Control Footer */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950 border-t border-slate-800 text-xs">
        <div className="flex items-center gap-3 w-1/3">
          <span className="text-slate-300 whitespace-nowrap">視角縮放:</span>
          <input
            type="range"
            min="0.3"
            max="3"
            step="0.1"
            value={zoomScale}
            onChange={e => setZoomScale(parseFloat(e.target.value))}
            className="w-full accent-sky-500 cursor-pointer"
          />
          <span className="font-mono text-sky-400 font-bold w-10">{zoomScale.toFixed(1)}x</span>
        </div>

        {showSensitivity && (
          <div className="flex items-center gap-3 w-1/2">
            <span className="text-emerald-400 font-semibold whitespace-nowrap">切線感度圓半徑 r₀:</span>
            <input
              type="range"
              min="0.02"
              max="1.0"
              step="0.005"
              value={sensitivityR}
              onChange={e => setSensitivityR(parseFloat(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <span className="font-mono text-emerald-400 font-bold w-16">{sensitivityR.toFixed(4)}</span>
          </div>
        )}
      </div>
    </div>
  );
};
