import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction } from '../../types';
import { freqResp, createTF, polyScale } from '../../utils/math';
import { getNiceTicks, formatTick } from '../../utils/plotUtils';
import { useCanvasTouchPanZoom } from '../../utils/useCanvasTouch';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface Props {
  tf: TransferFunction;
  gainK?: number;
  sensitivityR?: number;
  setSensitivityR?: (r: number) => void;
}

export const NyquistPlot: React.FC<Props> = ({ 
  tf, 
  gainK = 1.0, 
  sensitivityR: propR, 
  setSensitivityR: propSetR 
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [internalR, setInternalR] = useState<number>(0.1288);
  const sensitivityR = propR !== undefined ? propR : internalR;
  const setSensitivityR = propSetR || setInternalR;
  const [showSensitivity, setShowSensitivity] = useState<boolean>(true);

  // Scaled open loop plant K * G(s) (supports negative gain)
  const effectiveTF = useMemo(() => {
    try {
      return createTF(polyScale(tf.num, gainK), tf.den);
    } catch {
      return tf;
    }
  }, [tf, gainK]);

  // Pan & Zoom
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Mobile Touch Pan & Pinch Zoom Hook
  useCanvasTouchPanZoom({
    canvasRef,
    zoom,
    setZoom,
    pan,
    setPan,
    minZoom: 0.1,
    maxZoom: 50,
  });

  const handleReset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.1, Math.min(prev * factor, 50)));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.15 : 0.87;

      setZoom(prev => {
        const nextZoom = Math.max(0.1, Math.min(prev * factor, 50));
        const scaleChange = nextZoom / prev;
        setPan(p => ({
          x: mouseX - (mouseX - p.x) * scaleChange,
          y: mouseY - (mouseY - p.y) * scaleChange
        }));
        return nextZoom;
      });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
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

    const pad = Math.min(45, Math.max(25, W * 0.08));
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    const basePPU = (Math.min(plotW, plotH) / 4) * zoom;
    const originX = pad + plotW * 0.5 + 0.5 * basePPU + pan.x;
    const originY = pad + plotH * 0.5 + pan.y;

    const toPxX = (re: number) => originX + re * basePPU;
    const toPxY = (im: number) => originY - im * basePPU;

    const visibleMinRe = (pad - originX) / basePPU;
    const visibleMaxRe = (W - pad - originX) / basePPU;
    const visibleMaxIm = (originY - pad) / basePPU;
    const visibleMinIm = (originY - (H - pad)) / basePPU;

    // Clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, plotW, plotH);
    ctx.clip();

    // Subtle Grid (Light Grey)
    const reTicksGrid = getNiceTicks(visibleMinRe, visibleMaxRe, Math.max(4, Math.floor(plotW / 70)));
    const imTicksGrid = getNiceTicks(visibleMinIm, visibleMaxIm, Math.max(4, Math.floor(plotH / 60)));

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    reTicksGrid.forEach(re => {
      const x = toPxX(re);
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, pad + plotH);
      ctx.stroke();
    });

    imTicksGrid.forEach(im => {
      const y = toPxY(im);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + plotW, y);
      ctx.stroke();
    });

    // Real and Imaginary Axes
    const x0 = toPxX(0);
    const y0 = toPxY(0);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, y0);
    ctx.lineTo(pad + plotW, y0);
    ctx.moveTo(x0, pad);
    ctx.lineTo(x0, pad + plotH);
    ctx.stroke();

    // Critical Point (-1, 0): Red (#dc2626)
    const critX = toPxX(-1);
    const critY = toPxY(0);

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(critX - 6, critY - 6);
    ctx.lineTo(critX + 6, critY + 6);
    ctx.moveTo(critX + 6, critY - 6);
    ctx.lineTo(critX - 6, critY + 6);
    ctx.stroke();

    ctx.fillStyle = '#dc2626';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('(-1, j0)', critX, critY + 16);

    // Sensitivity Circle centered at (-1, 0) with radius r0 (Deep Green dashed)
    if (showSensitivity && sensitivityR > 0) {
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 1.75;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(critX, critY, sensitivityR * basePPU, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#166534';
      ctx.font = '10px "Fira Code", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`r₀ = ${sensitivityR.toFixed(4)}`, critX + sensitivityR * basePPU + 5, critY - 5);
    }

    // Sample frequencies for Nyquist contour
    const N = 600;
    const wMin = 1e-2, wMax = 1e3;
    const logMin = Math.log10(wMin), logMax = Math.log10(wMax);

    const posPts: { x: number; y: number }[] = [];
    const negPts: { x: number; y: number }[] = [];

    for (let i = 0; i <= N; i++) {
      const w = Math.pow(10, logMin + (i / N) * (logMax - logMin));
      const resp = freqResp(effectiveTF, w);
      const re = resp.val.re;
      const im = resp.val.im;

      posPts.push({ x: toPxX(re), y: toPxY(im) });
      negPts.push({ x: toPxX(re), y: toPxY(-im) });
    }

    // Positive Frequency Curve: Deep Green (#166534)
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    posPts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    // Negative Frequency Curve: Muted Slate Dashed
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    negPts.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore(); // Restore clip

    // Draw Labels: 80% Black (#333333)
    const reTicks = getNiceTicks(visibleMinRe, visibleMaxRe, Math.max(4, Math.floor(plotW / 80)));
    const imTicks = getNiceTicks(visibleMinIm, visibleMaxIm, Math.max(4, Math.floor(plotH / 60)));

    ctx.fillStyle = '#333333';
    ctx.font = '10px "Fira Code", monospace';

    reTicks.forEach(re => {
      const x = toPxX(re);
      if (x >= pad && x <= pad + plotW) {
        ctx.textAlign = 'center';
        ctx.fillText(formatTick(re), x, H - pad + 15);
      }
    });

    imTicks.forEach(im => {
      const y = toPxY(im);
      if (y >= pad && y <= pad + plotH) {
        ctx.textAlign = 'right';
        ctx.fillText(im === 0 ? '0' : (im > 0 ? `+j${formatTick(im)}` : `-j${formatTick(Math.abs(im))}`), pad - 6, y + 3);
      }
    });

    // Border
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(pad, pad, plotW, plotH);

  }, [effectiveTF, sensitivityR, showSensitivity, zoom, pan]);

  return (
    <div className="relative w-full h-full flex flex-col bg-white rounded-lg overflow-hidden border border-neutral-200 select-none shadow-sm">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-[#f8fafc] border-b border-neutral-200 text-xs gap-2">
        <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap text-[11px] text-[#333333]">
          <span className="font-bold text-[#333333]">Nyquist Diagram (奈氏圖)</span>
          <span className="text-[#166534] font-semibold">― ω &gt; 0 (正頻率)</span>
          <span className="text-[#64748b]">- - ω &lt; 0 (負頻率)</span>
          <span className="text-[#dc2626] font-semibold">✕ (-1, j0)</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[#333333] text-[11px] cursor-pointer">
            <input
              type="checkbox"
              checked={showSensitivity}
              onChange={e => setShowSensitivity(e.target.checked)}
              className="accent-[#166534] rounded"
            />
            感度圓 (Sensitivity)
          </label>
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

        {/* Floating Zoom Toolbar */}
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/95 backdrop-blur border border-neutral-200 p-1 rounded-lg shadow-sm">
          <button
            onClick={() => handleZoom(1.3)}
            className="p-1.5 hover:bg-neutral-100 active:bg-neutral-200 text-[#333333] rounded transition-all"
            title="放大"
          >
            <ZoomIn className="w-4 h-4 text-[#166534]" />
          </button>
          <button
            onClick={() => handleZoom(0.77)}
            className="p-1.5 hover:bg-neutral-100 active:bg-neutral-200 text-[#333333] rounded transition-all"
            title="縮小"
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
          <span className="hidden sm:inline">滾輪/雙指縮放 • 滑鼠/單指拖曳平移</span>
          <span className="sm:hidden">雙指縮放 • 單指平移</span>
        </div>
      </div>

      {/* Control Footer */}
      {showSensitivity && (
        <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-[#f8fafc] border-t border-neutral-200 text-xs gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <span className="text-[#166534] font-semibold whitespace-nowrap text-[11px]">切線感度圓半徑 r₀:</span>
            <input
              type="range"
              min="0.02"
              max="1.0"
              step="0.005"
              value={sensitivityR}
              onChange={e => setSensitivityR(parseFloat(e.target.value))}
              className="w-full accent-[#166534] cursor-pointer h-1.5"
            />
            <span className="font-mono text-[#166534] font-bold w-14 text-[11px]">{sensitivityR.toFixed(4)}</span>
          </div>
          <span className="text-[#555555] text-[10px] hidden sm:inline">
            檢驗 |1 + G(jω)| ≥ r₀
          </span>
        </div>
      )}
    </div>
  );
};
