import { useEffect, useRef } from 'react';

interface UseCanvasTouchOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: { x: number; y: number };
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  minZoom?: number;
  maxZoom?: number;
}

export function useCanvasTouchPanZoom({
  canvasRef,
  zoom,
  setZoom,
  pan,
  setPan,
  minZoom = 0.05,
  maxZoom = 100,
}: UseCanvasTouchOptions) {
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let touchStartPos = { x: 0, y: 0 };
    let initialPan = { x: 0, y: 0 };
    let initialDist = 0;
    let initialZoom = 1;
    let pinchMid = { x: 0, y: 0 };
    let isTouching = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isTouching = true;
        touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        initialPan = { ...panRef.current };
      } else if (e.touches.length === 2) {
        isTouching = true;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        initialZoom = zoomRef.current;
        const rect = canvas.getBoundingClientRect();
        pinchMid = {
          x: (t1.clientX + t2.clientX) / 2 - rect.left,
          y: (t1.clientY + t2.clientY) / 2 - rect.top,
        };
        initialPan = { ...panRef.current };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isTouching) return;
      if (e.cancelable) e.preventDefault();

      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartPos.x;
        const dy = e.touches[0].clientY - touchStartPos.y;
        setPan({
          x: initialPan.x + dx,
          y: initialPan.y + dy,
        });
      } else if (e.touches.length === 2 && initialDist > 5) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const scale = currentDist / initialDist;
        const nextZoom = Math.max(minZoom, Math.min(initialZoom * scale, maxZoom));
        const ratio = nextZoom / initialZoom;
        setZoom(nextZoom);
        setPan({
          x: pinchMid.x - (pinchMid.x - initialPan.x) * ratio,
          y: pinchMid.y - (pinchMid.y - initialPan.y) * ratio,
        });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        isTouching = false;
      } else if (e.touches.length === 1) {
        touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        initialPan = { ...panRef.current };
      }
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [canvasRef, setZoom, setPan, minZoom, maxZoom]);
}

export function useCanvasTouchBode({
  canvasRef,
  zoom,
  setZoom,
  panX,
  setPanX,
  minZoom = 0.1,
  maxZoom = 50,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  panX: number;
  setPanX: React.Dispatch<React.SetStateAction<number>>;
  minZoom?: number;
  maxZoom?: number;
}) {
  const panXRef = useRef(panX);
  panXRef.current = panX;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let touchStartX = 0;
    let initialPanX = 0;
    let initialDist = 0;
    let initialZoom = 1;
    let pinchMidX = 0;
    let isTouching = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isTouching = true;
        touchStartX = e.touches[0].clientX;
        initialPanX = panXRef.current;
      } else if (e.touches.length === 2) {
        isTouching = true;
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        initialZoom = zoomRef.current;
        const rect = canvas.getBoundingClientRect();
        pinchMidX = (t1.clientX + t2.clientX) / 2 - rect.left;
        initialPanX = panXRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isTouching) return;
      if (e.cancelable) e.preventDefault();

      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        setPanX(initialPanX + dx);
      } else if (e.touches.length === 2 && initialDist > 5) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const scale = currentDist / initialDist;
        const nextZoom = Math.max(minZoom, Math.min(initialZoom * scale, maxZoom));
        const ratio = nextZoom / initialZoom;
        setZoom(nextZoom);
        setPanX(pinchMidX - (pinchMidX - initialPanX) * ratio);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        isTouching = false;
      } else if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        initialPanX = panXRef.current;
      }
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [canvasRef, setZoom, setPanX, minZoom, maxZoom]);
}
