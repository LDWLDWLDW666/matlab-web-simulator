import React, { useEffect, useRef } from 'react';
import { TransferFunction } from '../../types';
import { simulateStepResponse } from '../../utils/math';

interface Props {
  tf: TransferFunction;
}

export const StepResponsePlot: React.FC<Props> = ({ tf }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { t, y, specs } = simulateStepResponse(tf);

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

    const margin = { top: 35, right: 40, bottom: 45, left: 65 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;

    // Background area
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(margin.left, margin.top, plotW, plotH);

    const tMax = t[t.length - 1] || 10;
    const yMinRaw = Math.min(...y, 0);
    const yMaxRaw = Math.max(...y, 1.2 * specs.yss, 1);
    const yMin = Math.floor(yMinRaw * 10) / 10;
    const yMax = Math.ceil(yMaxRaw * 10) / 10;

    const xToPx = (currT: number) => margin.left + (currT / tMax) * plotW;
    const yToPx = (currY: number) => margin.top + (1 - (currY - yMin) / (yMax - yMin)) * plotH;

    // Draw Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    // Horizontal grid
    const ySteps = 8;
    for (let i = 0; i <= ySteps; i++) {
      const val = yMin + (i / ySteps) * (yMax - yMin);
      const yPos = yToPx(val);
      ctx.beginPath();
      ctx.moveTo(margin.left, yPos);
      ctx.lineTo(margin.left + plotW, yPos);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '11px "Fira Code", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(2), margin.left - 8, yPos + 4);
    }

    // Vertical grid
    const tSteps = 10;
    for (let i = 0; i <= tSteps; i++) {
      const val = (i / tSteps) * tMax;
      const xPos = xToPx(val);
      ctx.beginPath();
      ctx.moveTo(xPos, margin.top);
      ctx.lineTo(xPos, margin.top + plotH);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '11px "Fira Code", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(val.toFixed(1), xPos, margin.top + plotH + 18);
    }

    // Steady state line yss
    const yssPx = yToPx(specs.yss);
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(margin.left, yssPx);
    ctx.lineTo(margin.left + plotW, yssPx);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2% Settling envelope band
    const yssPlus = yToPx(specs.yss * 1.02);
    const yssMinus = yToPx(specs.yss * 0.98);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
    ctx.fillRect(margin.left, Math.min(yssPlus, yssMinus), plotW, Math.abs(yssMinus - yssPlus));

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, yssPlus);
    ctx.lineTo(margin.left + plotW, yssPlus);
    ctx.moveTo(margin.left, yssMinus);
    ctx.lineTo(margin.left + plotW, yssMinus);
    ctx.stroke();
    ctx.setLineDash([]);

    // Plot Response Curve
    ctx.beginPath();
    for (let i = 0; i < t.length; i++) {
      const xPos = xToPx(t[i]);
      const yPos = yToPx(y[i]);
      if (i === 0) ctx.moveTo(xPos, yPos);
      else ctx.lineTo(xPos, yPos);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Annotate Peak Time tp & Mp
    if (specs.tp > 0 && specs.Mp > 0) {
      const tpPx = xToPx(specs.tp);
      const ypPx = yToPx(specs.yss * (1 + specs.Mp / 100));

      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tpPx, margin.top + plotH);
      ctx.lineTo(tpPx, ypPx);
      ctx.moveTo(margin.left, ypPx);
      ctx.lineTo(tpPx, ypPx);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(tpPx, ypPx, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`Peak: ${specs.Mp.toFixed(1)}% (tp = ${specs.tp.toFixed(2)}s)`, tpPx + 8, ypPx - 8);
    }

    // Annotate Settling Time ts
    if (specs.ts > 0 && specs.ts < tMax) {
      const tsPx = xToPx(specs.ts);
      ctx.strokeStyle = '#10b981';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(tsPx, margin.top);
      ctx.lineTo(tsPx, margin.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#10b981';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`ts = ${specs.ts.toFixed(2)}s`, tsPx, margin.top + 16);
    }

    // Border
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(margin.left, margin.top, plotW, plotH);

    // Axis Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time (seconds)', margin.left + plotW / 2, H - 10);

  }, [t, y, specs]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">Step Response (單位階躍響應)</span>
          <span className="text-sky-400">― 輸出 y(t)</span>
          <span className="text-slate-400">- - 穩態值 yss</span>
          <span className="text-emerald-400">±2% 誤差帶</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            上升時間 tr = <strong className="text-sky-400">{specs.tr.toFixed(2)}s</strong>
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            峰值時間 tp = <strong className="text-amber-400">{specs.tp.toFixed(2)}s</strong>
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            超調量 Mp = <strong className="text-pink-400">{specs.Mp.toFixed(1)}%</strong>
          </span>
          <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300">
            調節時間 ts = <strong className="text-emerald-400">{specs.ts.toFixed(2)}s</strong>
          </span>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
};
