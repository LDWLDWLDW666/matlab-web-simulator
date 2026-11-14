import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction } from '../../types';
import { computeFrequencySpecs, freqResp, unwrapPhase, createTF, polyScale } from '../../utils/math';
import { getNiceTicks, formatTick } from '../../utils/plotUtils';
import { useCanvasTouchBode } from '../../utils/useCanvasTouch';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface Props {
  tf: TransferFunction;
  gainK?: number;
}

export const BodePlot: React.FC<Props> = ({ tf, gainK = 1.0 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Scaled open loop plant K * G(s) (supports negative gain)
  const effectiveTF = useMemo(() => {
    try {
      return createTF(polyScale(tf.num, gainK), tf.den);
    } catch {
      return tf;
    }
  }, [tf, gainK]);

  const specs = useMemo(() => computeFrequencySpecs(effectiveTF), [effectiveTF]);

  // Pan & Zoom
  const [zoom, setZoom] = useState<number>(1.0);
  const [panX, setPanX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<number>(0);

  // Mobile Touch Pan & Pinch Zoom Hook
  useCanvasTouchBode({
    canvasRef,
    zoom,
    setZoom,
    panX,
    setPanX,
    minZoom: 0.1,
    maxZoom: 50,
  });

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

    // Background: Pure White
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const margin = { 
      left: Math.min(50, Math.max(35, W * 0.1)), 
      right: 20, 
      top: 15, 
      bottom: 25 
    };
    const plotW = W - margin.left - margin.right;
    const gap = 16;
    const subH = (H - margin.top - margin.bottom - gap) / 2;

    if (subH <= 10 || plotW <= 10) return;

    // Frequency grid
    const minDec = -2;
    const maxDec = 3;
    const totalDecades = maxDec - minDec;

    const xToPx = (w: number) => {
      const dec = Math.log10(Math.max(1e-6, w));
      return margin.left + ((dec - minDec) / totalDecades) * plotW * zoom + panX;
    };

    const pxToW = (px: number) => {
      const frac = (px - margin.left - panX) / (plotW * zoom);
      return Math.pow(10, minDec + frac * totalDecades);
    };

    const N = Math.min(400, Math.max(150, Math.floor(plotW)));
    const freqs: number[] = [];
    const mags: number[] = [];
    const phasesRaw: number[] = [];

    const visibleWMin = pxToW(margin.left);
    const visibleWMax = pxToW(margin.left + plotW);
    const startW = Math.max(1e-4, Math.min(visibleWMin, 1e-2));
    const endW = Math.max(startW * 10, Math.max(visibleWMax, 1e3));

    const logS = Math.log10(startW);
    const logE = Math.log10(endW);

    for (let i = 0; i <= N; i++) {
      const w = Math.pow(10, logS + (i / N) * (logE - logS));
      const resp = freqResp(effectiveTF, w);
      freqs.push(w);
      mags.push(resp.magDB);
      phasesRaw.push(resp.phaseDeg);
    }

    const phases = unwrapPhase(phasesRaw);

    // Magnitude range
    const visibleMags = mags.filter((_, idx) => {
      const x = xToPx(freqs[idx]);
      return x >= margin.left && x <= margin.left + plotW;
    });

    let rawMagMin = visibleMags.length > 0 ? Math.min(...visibleMags) : -60;
    let rawMagMax = visibleMags.length > 0 ? Math.max(...visibleMags) : 20;
    if (!isFinite(rawMagMin)) rawMagMin = -80;
    if (!isFinite(rawMagMax)) rawMagMax = 40;
    rawMagMin = Math.min(rawMagMin, -20);
    rawMagMax = Math.max(rawMagMax, 20);

    const magMin = Math.floor(rawMagMin / 20) * 20 - 10;
    const magMax = Math.ceil(rawMagMax / 20) * 20 + 10;

    // Phase range
    const visiblePhases = phases.filter((_, idx) => {
      const x = xToPx(freqs[idx]);
      return x >= margin.left && x <= margin.left + plotW;
    });

    let rawPhaseMin = visiblePhases.length > 0 ? Math.min(...visiblePhases) : -270;
    let rawPhaseMax = visiblePhases.length > 0 ? Math.max(...visiblePhases) : 0;
    if (!isFinite(rawPhaseMin)) rawPhaseMin = -360;
    if (!isFinite(rawPhaseMax)) rawPhaseMax = 0;
    rawPhaseMin = Math.min(rawPhaseMin, -200);
    rawPhaseMax = Math.max(rawPhaseMax, 10);

    const phaseMin = Math.floor(rawPhaseMin / 45) * 45;
    const phaseMax = Math.ceil(rawPhaseMax / 45) * 45;

    const magToPx = (m: number) => margin.top + subH - ((m - magMin) / (magMax - magMin)) * subH;
    const phaseToPx = (p: number) => margin.top + subH + gap + subH - ((p - phaseMin) / (phaseMax - phaseMin)) * subH;

    // Subplot Helper
    const drawSubplot = (
      topY: number, 
      title: string, 
      unit: string, 
      yMin: number, 
      yMax: number, 
      toYPx: (v: number) => number, 
      isBottom: boolean
    ) => {
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      for (let dec = minDec - 2; dec <= maxDec + 2; dec++) {
        const w = Math.pow(10, dec);
        const x = xToPx(w);
        if (x >= margin.left && x <= margin.left + plotW) {
          ctx.beginPath();
          ctx.moveTo(x, topY);
          ctx.lineTo(x, topY + subH);
          ctx.stroke();
        }
      }

      const yTicks = getNiceTicks(yMin, yMax, 5);
      yTicks.forEach(yVal => {
        const y = toYPx(yVal);
        if (y >= topY && y <= topY + subH) {
          ctx.beginPath();
          ctx.moveTo(margin.left, y);
          ctx.lineTo(margin.left + plotW, y);
          ctx.stroke();
        }
      });

      // Title
      ctx.fillStyle = '#333333';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${title} (${unit})`, margin.left + 8, topY + 16);

      // Y Labels: 80% black (#333333)
      ctx.fillStyle = '#333333';
      ctx.font = '10px "Fira Code", monospace';
      ctx.textAlign = 'right';
      yTicks.forEach(yVal => {
        const y = toYPx(yVal);
        if (y >= topY && y <= topY + subH) {
          ctx.fillText(formatTick(yVal), margin.left - 6, y + 3);
        }
      });

      // X Decades Labels
      if (isBottom) {
        ctx.textAlign = 'center';
        for (let dec = minDec; dec <= maxDec; dec++) {
          const w = Math.pow(10, dec);
          const x = xToPx(w);
          if (x >= margin.left && x <= margin.left + plotW) {
            ctx.fillText(`10^${dec}`, x, topY + subH + 15);
          }
        }
      }

      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(margin.left, topY, plotW, subH);
    };

    // Subplots
    drawSubplot(margin.top, 'Magnitude', 'dB', magMin, magMax, magToPx, false);
    drawSubplot(margin.top + subH + gap, 'Phase', 'deg', phaseMin, phaseMax, phaseToPx, true);

    // Clip curves
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, plotW, subH);
    ctx.clip();

    // 0 dB dashed line
    const y0 = magToPx(0);
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, y0);
    ctx.lineTo(margin.left + plotW, y0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Magnitude Curve: Deep Green (#166534)
    ctx.beginPath();
    for (let i = 0; i < freqs.length; i++) {
      const x = xToPx(freqs[i]);
      const y = magToPx(mags[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // Clip phase curve
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top + subH + gap, plotW, subH);
    ctx.clip();

    // -180 deg line: Red critical line (#dc2626)
    const y180 = phaseToPx(-180);
    ctx.strokeStyle = '#dc2626';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(margin.left, y180);
    ctx.lineTo(margin.left + plotW, y180);
    ctx.stroke();
    ctx.setLineDash([]);

    // Phase Curve: Muted dark slate (#555555)
    ctx.beginPath();
    for (let i = 0; i < freqs.length; i++) {
      const x = xToPx(freqs[i]);
      const y = phaseToPx(phases[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();

    // PM & GM Annotations
    if (specs.wgc && specs.PM !== null) {
      const xG = xToPx(specs.wgc);
      if (xG >= margin.left && xG <= margin.left + plotW) {
        ctx.strokeStyle = '#166534';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(xG, margin.top);
        ctx.lineTo(xG, margin.top + subH * 2 + gap);
        ctx.stroke();
        ctx.setLineDash([]);

        // PM bar: Deep Green
        const yP = phaseToPx(-180 + specs.PM);
        ctx.strokeStyle = '#166534';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xG, y180);
        ctx.lineTo(xG, yP);
        ctx.stroke();

        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.arc(xG, yP, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (specs.wpc && specs.GM !== null) {
      const xP = xToPx(specs.wpc);
      if (xP >= margin.left && xP <= margin.left + plotW) {
        ctx.strokeStyle = '#dc2626';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(xP, margin.top);
        ctx.lineTo(xP, margin.top + subH * 2 + gap);
        ctx.stroke();
        ctx.setLineDash([]);

        // GM bar: Red
        const yM = magToPx(-specs.GM);
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xP, y0);
        ctx.lineTo(xP, yM);
        ctx.stroke();

        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(xP, yM, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  }, [effectiveTF, zoom, panX, specs]);

  return (
    <div className="relative w-full h-full flex flex-col bg-white rounded-lg overflow-hidden border border-neutral-200 select-none shadow-sm">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-[#f8fafc] border-b border-neutral-200 text-xs gap-2">
        <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap text-[11px] text-[#333333]">
          <span className="font-bold text-[#333333]">Bode Plot (波德圖)</span>
          <span className="text-[#166534] font-semibold">― 幅值 (dB)</span>
          <span className="text-[#555555]">― 相位 (deg)</span>
          <span className="text-[#dc2626]">- - 180°臨界</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="bg-white px-2 py-0.5 rounded border border-neutral-200 text-[#333333]">
            PM = <strong className={specs.PM && specs.PM > 0 ? "text-[#166534]" : "text-[#dc2626]"}>{specs.PM !== null ? `${specs.PM.toFixed(1)}°` : '∞'}</strong>
          </span>
          <span className="bg-white px-2 py-0.5 rounded border border-neutral-200 text-[#333333]">
            GM = <strong className={specs.GM && specs.GM > 0 ? "text-[#166534]" : "text-[#dc2626]"}>{specs.GM !== null ? `${specs.GM.toFixed(1)} dB` : '∞'}</strong>
          </span>
          <span className={`px-2 py-0.5 rounded font-bold ${specs.isStable ? "bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]" : "bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]"}`}>
            {specs.isStable ? "開迴路穩定" : "開迴路不穩定"}
          </span>
        </div>
      </div>

      <div 
        className={`flex-1 w-full relative bg-white ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <canvas 
          ref={canvasRef} 
          className="w-full h-full block" 
          style={{ touchAction: 'none' }}
        />

        {/* Floating Toolbar */}
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/95 backdrop-blur border border-neutral-200 p-1 rounded-lg shadow-sm">
          <button
            onClick={() => handleZoom(1.3)}
            className="p-1.5 hover:bg-neutral-100 active:bg-neutral-200 text-[#333333] rounded transition-all"
            title="放大頻率軸"
          >
            <ZoomIn className="w-4 h-4 text-[#166534]" />
          </button>
          <button
            onClick={() => handleZoom(0.77)}
            className="p-1.5 hover:bg-neutral-100 active:bg-neutral-200 text-[#333333] rounded transition-all"
            title="縮小頻率軸"
          >
            <ZoomOut className="w-4 h-4 text-[#166534]" />
          </button>
          <div className="w-[1px] h-4 bg-neutral-200 mx-0.5" />
          <button
            onClick={handleReset}
            className="p-1.5 hover:bg-neutral-100 active:bg-neutral-200 text-[#555555] rounded transition-all flex items-center gap-1 text-[11px]"
            title="復原預設視角"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#555555]" />
            <span className="hidden sm:inline">重設</span>
          </button>
          <div className="text-[10px] text-[#555555] font-mono px-1">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Tip Badge */}
        <div className="absolute bottom-2 left-3 flex items-center gap-1 text-[10px] text-[#555555] bg-white/90 px-2 py-0.5 rounded border border-neutral-200 pointer-events-none shadow-xs">
          <Move className="w-3 h-3 text-[#166534]" />
          <span className="hidden sm:inline">滾輪/雙指縮放 • 水平拖曳平移</span>
          <span className="sm:hidden">雙指縮放 • 單指平移</span>
        </div>
      </div>
    </div>
  );
};
