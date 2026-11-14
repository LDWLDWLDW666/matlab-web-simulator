import React, { useEffect, useRef, useState, useMemo } from 'react';
import { TransferFunction, CNumber } from '../../types';
import { computeRootLocus, findRoots, polyAdd, polyScale } from '../../utils/math';
import { getNiceTicks, formatTick } from '../../utils/plotUtils';
import { useCanvasTouchPanZoom } from '../../utils/useCanvasTouch';
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface Props {
  tf: TransferFunction;
  gainK?: number;
  setGainK?: (k: number) => void;
}

export const RootLocusPlot: React.FC<Props> = ({ tf, gainK: propGainK, setGainK: propSetGainK }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [internalGainK, setInternalGainK] = useState<number>(1.0);
  const gainK = propGainK !== undefined ? propGainK : internalGainK;
  const setGainK = propSetGainK || setInternalGainK;
  const [closedLoopPoles, setClosedLoopPoles] = useState<CNumber[]>([]);

  // Pan & Zoom State
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
    minZoom: 0.05,
    maxZoom: 100,
  });

  const { branches, paths, negativePaths, asymptotes } = useMemo(() => computeRootLocus(tf), [tf]);

  // Compute closed loop poles for current gain K (supports any real K, including negative)
  useEffect(() => {
    try {
      const charPoly = polyAdd(tf.den, polyScale(tf.num, gainK));
      const roots = findRoots(charPoly);
      setClosedLoopPoles(roots);
    } catch (e) {
      console.error(e);
    }
  }, [tf, gainK]);

  // Auto-fit initial range when tf changes
  const baseRange = useMemo(() => {
    let minSigma = -6, maxSigma = 2, maxOmega = 5;
    const allRoots = branches.flatMap(b => b.roots).concat(tf.poles).concat(tf.zeros);
    if (allRoots.length > 0) {
      const sigmas = allRoots.map(r => r.re).filter(v => isFinite(v) && Math.abs(v) < 200);
      const omegas = allRoots.map(r => Math.abs(r.im)).filter(v => isFinite(v) && Math.abs(v) < 200);
      if (sigmas.length > 0) {
        minSigma = Math.min(...sigmas, -3);
        maxSigma = Math.max(...sigmas, 1.5);
      }
      if (omegas.length > 0) {
        maxOmega = Math.max(...omegas, 3);
      }
    }
    const padX = Math.max((maxSigma - minSigma) * 0.25, 1.5);
    const padY = Math.max(maxOmega * 0.25, 1.5);
    return {
      minSigma: minSigma - padX,
      maxSigma: maxSigma + padX,
      maxOmega: maxOmega + padY
    };
  }, [tf, branches]);

  // Reset View
  const handleReset = () => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  // Zoom In / Out
  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.05, Math.min(prev * factor, 100)));
  };

  // Mouse Wheel Zoom
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
        const nextZoom = Math.max(0.05, Math.min(prev * factor, 100));
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

  // Mouse Drag to Pan
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

  // Render Canvas
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

    const sRange = baseRange.maxSigma - baseRange.minSigma;
    const oRange = 2 * baseRange.maxOmega;

    const ppuX = (plotW / sRange) * zoom;
    const ppuY = (plotH / oRange) * zoom;

    const originX = pad + ((0 - baseRange.minSigma) / sRange) * plotW * zoom + pan.x;
    const originY = pad + ((baseRange.maxOmega - 0) / oRange) * plotH * zoom + pan.y;

    const toPxX = (sigma: number) => originX + sigma * ppuX;
    const toPxY = (omega: number) => originY - omega * ppuY;

    const visibleMinSigma = (pad - originX) / ppuX;
    const visibleMaxSigma = (W - pad - originX) / ppuX;
    const visibleMaxOmega = (originY - pad) / ppuY;
    const visibleMinOmega = (originY - (H - pad)) / ppuY;

    // Clip to plot box
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, plotW, plotH);
    ctx.clip();

    // Subtle Grid (Light Grey)
    const targetCountX = Math.max(4, Math.floor(plotW / 75));
    const targetCountY = Math.max(4, Math.floor(plotH / 60));
    const sigmaTicks = getNiceTicks(visibleMinSigma, visibleMaxSigma, targetCountX);
    const omegaTicks = getNiceTicks(visibleMinOmega, visibleMaxOmega, targetCountY);

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    sigmaTicks.forEach(s => {
      const x = toPxX(s);
      ctx.beginPath();
      ctx.moveTo(x, pad);
      ctx.lineTo(x, pad + plotH);
      ctx.stroke();
    });

    omegaTicks.forEach(o => {
      const y = toPxY(o);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(pad + plotW, y);
      ctx.stroke();
    });

    // Real and Imaginary Axes
    const x0 = toPxX(0);
    const y0 = toPxY(0);

    // Real Axis (sigma) - Dark Muted Grey
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, y0);
    ctx.lineTo(pad + plotW, y0);
    ctx.stroke();

    // Imaginary Axis (j omega) - Red 20% / Red Line (Stability Boundary)
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(x0, pad);
    ctx.lineTo(x0, pad + plotH);
    ctx.stroke();

    // Helper: draw continuous trajectories
    const drawTrajectorySet = (pathList: CNumber[][], strokeColor: string, isDashed = false) => {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.2;
      if (isDashed) {
        ctx.setLineDash([5, 5]);
      } else {
        ctx.setLineDash([]);
      }

      pathList.forEach(path => {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < path.length; i++) {
          const pt = path[i];
          if (!isFinite(pt.re) || !isFinite(pt.im)) continue;

          if (started && i > 0) {
            const prev = path[i - 1];
            const crossAxis = (prev.im > 0.08 && pt.im < -0.08) || (prev.im < -0.08 && pt.im > 0.08);
            const largeJump = Math.hypot(pt.re - prev.re, pt.im - prev.im) > 15;
            if (crossAxis || largeJump) {
              ctx.stroke();
              ctx.beginPath();
              started = false;
            }
          }

          const x = toPxX(pt.re);
          const y = toPxY(pt.im);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);
    };

    // 1. Draw Negative K Complementary Root Locus (Red Dashed)
    drawTrajectorySet(negativePaths, '#dc2626', true);

    // 2. Draw Positive K Standard Root Locus (Deep Green Solid)
    drawTrajectorySet(paths, '#166534', false);

    // Draw Asymptotes (Muted slate dashed)
    if (asymptotes.angles.length > 0) {
      const ax = toPxX(asymptotes.centroid);
      const r = Math.max(plotW, plotH) * 4;
      ctx.strokeStyle = '#94a3b8';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;

      asymptotes.angles.forEach(ang => {
        const rad = (ang * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(ax, y0);
        ctx.lineTo(ax + r * Math.cos(rad), y0 - r * Math.sin(rad));
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // Draw Open Loop Zeros (o) - Deep Green outline with white fill
    tf.zeros.forEach(z => {
      const zx = toPxX(z.re);
      const zy = toPxY(z.im);
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(zx, zy, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Draw Open Loop Poles (x) - Deep Green
    tf.poles.forEach(p => {
      const px = toPxX(p.re);
      const py = toPxY(p.im);
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px - 5, py - 5);
      ctx.lineTo(px + 5, py + 5);
      ctx.moveTo(px + 5, py - 5);
      ctx.lineTo(px - 5, py + 5);
      ctx.stroke();
    });

    // Draw Current Closed Loop Poles for gain K
    // If K >= 0: Deep Green square; If K < 0: Red square!
    const clpColor = gainK >= 0 ? '#166534' : '#dc2626';
    closedLoopPoles.forEach(clp => {
      const cx = toPxX(clp.re);
      const cy = toPxY(clp.im);
      ctx.fillStyle = clpColor;
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 5, cy - 5, 10, 10);
    });

    ctx.restore(); // Restore clipping

    // Draw Tick Labels: 80% Black (#333333)
    ctx.fillStyle = '#333333';
    ctx.font = '10px "Fira Code", monospace';

    sigmaTicks.forEach(s => {
      const x = toPxX(s);
      if (x >= pad && x <= pad + plotW) {
        ctx.textAlign = 'center';
        ctx.fillText(formatTick(s), x, H - pad + 15);
      }
    });

    omegaTicks.forEach(o => {
      const y = toPxY(o);
      if (y >= pad && y <= pad + plotH) {
        ctx.textAlign = 'right';
        ctx.fillText(o === 0 ? '0' : (o > 0 ? `+j${formatTick(o)}` : `-j${formatTick(Math.abs(o))}`), pad - 6, y + 3);
      }
    });

    // Outer border: Clean light slate
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(pad, pad, plotW, plotH);

  }, [tf, branches, paths, negativePaths, asymptotes, closedLoopPoles, gainK, zoom, pan, baseRange]);

  const dominantPole = closedLoopPoles.reduce<CNumber | null>((dom, p) => {
    if (!dom || p.re > dom.re) return p;
    return dom;
  }, null);

  const wn = dominantPole ? dominantPole.abs() : 0;
  const zeta = wn > 1e-6 && dominantPole ? -dominantPole.re / wn : 0;
  const isClosedLoopStable = closedLoopPoles.every(p => p.re < 0);

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col bg-white rounded-lg overflow-hidden border border-neutral-200 select-none shadow-sm">
      {/* Top Banner (White & 80% Black Text & Deep Green / Red 20%) */}
      <div className="flex flex-wrap items-center justify-between px-3 py-1.5 bg-[#f8fafc] border-b border-neutral-200 text-xs gap-2">
        <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap text-[11px] text-[#333333]">
          <span className="font-bold text-[#333333]">Root Locus (根軌跡)</span>
          <span className="text-[#166534] font-semibold">― 正增益 (K &gt; 0)</span>
          <span className="text-[#dc2626] font-semibold">- - 負增益 (K &lt; 0)</span>
          <span className="text-[#166534]">✕ 極點</span>
          <span className="text-[#166534]">○ 零點</span>
          <span className={gainK >= 0 ? "text-[#166534] font-bold" : "text-[#dc2626] font-bold"}>
            ■ 閉迴路極點 (K={gainK.toFixed(2)})
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="bg-white px-2 py-0.5 rounded border border-neutral-200 text-[#333333] font-mono">
            σa = {asymptotes.centroid.toFixed(2)}
          </span>
          <span className={`px-2 py-0.5 rounded font-bold ${isClosedLoopStable ? "bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]" : "bg-[#fef2f2] text-[#dc2626] border border-[#fecaca]"}`}>
            {isClosedLoopStable ? `閉迴路穩定` : `閉迴路不穩定`}
          </span>
        </div>
      </div>

      {/* Canvas Area with Mouse and Touch pan/zoom */}
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

        {/* Floating Zoom & Pan Toolbar */}
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
          <span className="sm:hidden">雙指縮放 • 單指拖曳</span>
        </div>
      </div>

      {/* Gain Slider Footer (Supports Negative K!) */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-[#f8fafc] border-t border-neutral-200 text-xs gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="font-semibold text-[#333333] whitespace-nowrap text-[11px]">增益 K:</span>
          <input
            type="number"
            step="0.1"
            value={gainK}
            onChange={e => setGainK(parseFloat(e.target.value) || 0)}
            className="w-16 bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-center font-mono text-[#166534] font-bold text-xs select-text focus:outline-none focus:border-[#166534]"
          />
          <input
            type="range"
            min="-50"
            max="50"
            step="0.1"
            value={gainK}
            onChange={e => setGainK(parseFloat(e.target.value))}
            className="w-full accent-[#166534] cursor-pointer h-1.5"
          />
          <span className="font-mono text-[#166534] font-bold w-12 text-[11px]">{gainK.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-3 text-[#555555] text-[11px]">
          <span>阻尼比 ζ: <strong className="text-[#166534] font-mono">{zeta.toFixed(3)}</strong></span>
          <span>自然頻率 ωn: <strong className="text-[#166534] font-mono">{wn.toFixed(2)}</strong></span>
        </div>
      </div>
    </div>
  );
};
