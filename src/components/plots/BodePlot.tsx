import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction } from '../../types';
import { computeFrequencySpecs, freqResp, unwrapPhase } from '../../utils/math';
import { getNiceTicks, formatTick } from '../../utils/plotUtils';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface Props {
  tf: TransferFunction;
}

export const BodePlot: React.FC<Props> = ({ tf }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const specs = useMemo(() => computeFrequencySpecs(tf), [tf]);

  // Pan & Zoom
  const [zoom, setZoom] = useState<number>(1.0);
  const [panX, setPanX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<number>(0);

  const handleReset = () => {
    setZoom(1.0);
    setPanX(0);
  };

  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.1, Math.min(prev * factor, 50)));
  };

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const factor = e.deltaY < 0 ? 1.15 : 0.87;

      setZoom(prev => {
        const nextZoom = Math.max(0.1, Math.min(prev * factor, 50));
        const scaleChange = nextZoom / prev;
        setPanX(p => mouseX - (mouseX - p) * scaleChange);
        return nextZoom;
      });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = e.clientX - panX;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanX(e.clientX - dragStartRef.current);
  };

  const handleMouseUp = () => setIsDragging(false);

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

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    const margin = { top: 30, right: 35, bottom: 45, left: 65 };
    const gap = 35;
    const subH = (H - margin.top - margin.bottom - gap) / 2;
    const plotW = W - margin.left - margin.right;

    // Base frequency range
    const baseLogMin = -2;
    const baseLogMax = 3;
    const totalLogSpan = baseLogMax - baseLogMin;

    // Viewport log bounds with zoom and pan
    const viewLogSpan = totalLogSpan / zoom;
    const panLogOffset = (-panX / (plotW * zoom)) * totalLogSpan;
    const currLogMin = baseLogMin + panLogOffset;
    const currLogMax = currLogMin + viewLogSpan;

    // Sample data across visible range with padding
    const N = 400;
    const sampleLogMin = currLogMin - 0.5;
    const sampleLogMax = currLogMax + 0.5;

    const freqs: number[] = [];
    const mags: number[] = [];
    const rawPhases: number[] = [];

    for (let i = 0; i <= N; i++) {
      const logW = sampleLogMin + (i / N) * (sampleLogMax - sampleLogMin);
      const w = Math.pow(10, logW);
      const resp = freqResp(tf, w);
      freqs.push(w);
      mags.push(resp.magDB);
      rawPhases.push(resp.phaseDeg);
    }
    const phases = unwrapPhase(rawPhases);

    // Auto y bounds
    const visibleMags = mags.filter((_, idx) => {
      const logW = Math.log10(freqs[idx]);
      return logW >= currLogMin && logW <= currLogMax;
    });
    const visiblePhases = phases.filter((_, idx) => {
      const logW = Math.log10(freqs[idx]);
      return logW >= currLogMin && logW <= currLogMax;
    });

    const minMagVal = visibleMags.length > 0 ? Math.min(...visibleMags) : -40;
    const maxMagVal = visibleMags.length > 0 ? Math.max(...visibleMags) : 20;
    const magMin = Math.floor(Math.min(minMagVal - 10, -30) / 10) * 10;
    const magMax = Math.ceil(Math.max(maxMagVal + 10, 20) / 10) * 10;

    const minPhaseVal = visiblePhases.length > 0 ? Math.min(...visiblePhases) : -270;
    const maxPhaseVal = visiblePhases.length > 0 ? Math.max(...visiblePhases) : 0;
    const phaseMin = Math.floor(Math.min(minPhaseVal - 20, -200) / 45) * 45;
    const phaseMax = Math.ceil(Math.max(maxPhaseVal + 20, 0) / 45) * 45;

    const xToPx = (w: number) => margin.left + ((Math.log10(w) - currLogMin) / (currLogMax - currLogMin)) * plotW;
    const magToPx = (m: number) => margin.top + (1 - (m - magMin) / (magMax - magMin)) * subH;
    const phaseToPx = (p: number) => margin.top + subH + gap + (1 - (p - phaseMin) / (phaseMax - phaseMin)) * subH;

    // Draw Subplot Helper
    const drawSubplot = (topY: number, title: string, unit: string, yMin: number, yMax: number, toYPx: (v: number) => number, isBottom: boolean) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(margin.left, topY, plotW, subH);
      ctx.clip();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(margin.left, topY, plotW, subH);

      // Y Grid
      const yTicks = getNiceTicks(yMin, yMax, 6);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      yTicks.forEach(yVal => {
        const y = toYPx(yVal);
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + plotW, y);
        ctx.stroke();
      });

      // Log Frequency Grid
      const minDec = Math.floor(currLogMin);
      const maxDec = Math.ceil(currLogMax);
      for (let dec = minDec; dec <= maxDec; dec++) {
        for (let mult = 1; mult < 10; mult++) {
          const w = mult * Math.pow(10, dec);
          const x = xToPx(w);
          if (x < margin.left || x > margin.left + plotW) continue;
          ctx.beginPath();
          ctx.moveTo(x, topY);
          ctx.lineTo(x, topY + subH);
          ctx.strokeStyle = mult === 1 ? '#334155' : '#141e33';
          ctx.stroke();
        }
      }

      ctx.restore();

      // Titles & Axis Ticks outside clip
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${title} (${unit})`, margin.left + 8, topY + 18);

      // Y Labels
      ctx.fillStyle = '#64748b';
      ctx.font = '11px "Fira Code", monospace';
      ctx.textAlign = 'right';
      const yTicksOut = getNiceTicks(yMin, yMax, 6);
      yTicksOut.forEach(yVal => {
        const y = toYPx(yVal);
        if (y >= topY && y <= topY + subH) {
          ctx.fillText(formatTick(yVal), margin.left - 8, y + 4);
        }
      });

      // X Decades Labels (only on bottom subplot)
      if (isBottom) {
        ctx.textAlign = 'center';
        for (let dec = minDec; dec <= maxDec; dec++) {
          const w = Math.pow(10, dec);
          const x = xToPx(w);
          if (x >= margin.left && x <= margin.left + plotW) {
            ctx.fillText(`10^${dec}`, x, topY + subH + 18);
          }
        }
      }

      ctx.strokeStyle = '#334155';
      ctx.strokeRect(margin.left, topY, plotW, subH);
    };

    // Subplot 1: Magnitude
    drawSubplot(margin.top, 'Magnitude', 'dB', magMin, magMax, magToPx, false);
    // Subplot 2: Phase
    drawSubplot(margin.top + subH + gap, 'Phase', 'deg', phaseMin, phaseMax, phaseToPx, true);

    // Clip curves
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, plotW, subH);
    ctx.clip();

    // 0 dB dashed line
    const y0 = magToPx(0);
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, y0);
    ctx.lineTo(margin.left + plotW, y0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Magnitude Curve
    ctx.beginPath();
    for (let i = 0; i < freqs.length; i++) {
      const x = xToPx(freqs[i]);
      const y = magToPx(mags[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // Clip phase curve
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top + subH + gap, plotW, subH);
    ctx.clip();

    // -180 deg line
    const y180 = phaseToPx(-180);
    ctx.strokeStyle = '#ef4444';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, y180);
    ctx.lineTo(margin.left + plotW, y180);
    ctx.stroke();
    ctx.setLineDash([]);

    // Phase Curve
    ctx.beginPath();
    for (let i = 0; i < freqs.length; i++) {
      const x = xToPx(freqs[i]);
      const y = phaseToPx(phases[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // Annotations for wgc, PM & wpc, GM
    if (specs.wgc && specs.PM !== null) {
      const xG = xToPx(specs.wgc);
      if (xG >= margin.left && xG <= margin.left + plotW) {
        ctx.strokeStyle = '#38bdf8';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(xG, margin.top);
        ctx.lineTo(xG, margin.top + subH * 2 + gap);
        ctx.stroke();
        ctx.setLineDash([]);

        // PM bar
        const yP = phaseToPx(-180 + specs.PM);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xG, y180);
        ctx.lineTo(xG, yP);
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(xG, yP, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (specs.wpc && specs.GM !== null) {
      const xP = xToPx(specs.wpc);
      if (xP >= margin.left && xP <= margin.left + plotW) {
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(xP, margin.top);
        ctx.lineTo(xP, margin.top + subH * 2 + gap);
        ctx.stroke();
        ctx.setLineDash([]);

        // GM bar
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
    }

    // X Axis Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (rad/s)', margin.left + plotW / 2, H - 8);

  }, [tf, zoom, panX, specs]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900 rounded-lg overflow-hidden border border-slate-800 select-none">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-200">Bode Diagram (波德圖)</span>
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

      <div 
        className={`flex-1 w-full relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Floating Toolbar */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur border border-slate-700 p-1 rounded-lg shadow-lg">
          <button
            onClick={() => handleZoom(1.3)}
            className="p-1.5 hover:bg-slate-800 active:bg-slate-700 text-slate-200 rounded transition-all"
            title="放大頻率軸"
          >
            <ZoomIn className="w-4 h-4 text-sky-400" />
          </button>
          <button
            onClick={() => handleZoom(0.77)}
            className="p-1.5 hover:bg-slate-800 active:bg-slate-700 text-slate-200 rounded transition-all"
            title="縮小頻率軸"
          >
            <ZoomOut className="w-4 h-4 text-sky-400" />
          </button>
          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
          <button
            onClick={handleReset}
            className="p-1.5 hover:bg-slate-800 active:bg-slate-700 text-slate-200 rounded transition-all flex items-center gap-1 text-[11px]"
            title="復原預設視角"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            重設視角
          </button>
          <div className="text-[10px] text-slate-400 font-mono px-1">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Tip Badge */}
        <div className="absolute bottom-2 left-4 flex items-center gap-1 text-[11px] text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-md border border-slate-800 pointer-events-none">
          <Move className="w-3 h-3 text-sky-400" />
          <span>滾輪縮放頻率座標 • 水平拖曳平移波德圖</span>
        </div>
      </div>
    </div>
  );
};
