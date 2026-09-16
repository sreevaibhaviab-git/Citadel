import { useEffect, useRef } from 'react';
import type { CitySim } from './sim';
import type { WeatherMode } from './types';

const DENSITY: Record<WeatherMode, number> = {
  CLEAR: 0,
  CLOUDY: 0,
  RAIN: 260,
  'HEAVY RAIN': 520,
  FOG: 0,
  STORM: 640,
};

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

/** Screen-space rain + lightning. Cheap, never blocks pointer events. */
export default function WeatherOverlay({ sim }: { sim: CitySim }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const fogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let drops: Drop[] = [];
    let raf = 0;
    let running = true;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const make = (h: number): Drop => ({
      x: Math.random() * canvas.width,
      y: Math.random() * h,
      len: 9 + Math.random() * 22,
      speed: 620 + Math.random() * 700,
      alpha: 0.12 + Math.random() * 0.3,
    });

    let last = performance.now();

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const mode = sim.weather;
      const target = DENSITY[mode];
      const storm = mode === 'STORM';

      while (drops.length < target) drops.push(make(canvas.height));
      if (drops.length > target) drops.length = target;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (target > 0) {
        const slant = storm ? 0.42 : 0.18;
        ctx.lineCap = 'round';
        for (const d of drops) {
          d.y += d.speed * dt;
          d.x += d.speed * dt * slant;
          if (d.y > canvas.height) {
            d.y = -20;
            d.x = Math.random() * canvas.width;
          }
          if (d.x > canvas.width) d.x = -10;
          ctx.strokeStyle = `rgba(190, 214, 235, ${d.alpha})`;
          ctx.lineWidth = storm ? 1.2 : 1;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.len * slant, d.y - d.len);
          ctx.stroke();
        }
      }

      // fog / cloud grading
      if (fogRef.current) {
        const fog =
          mode === 'FOG' ? 0.5 : mode === 'STORM' ? 0.3 : mode === 'HEAVY RAIN' ? 0.24 : mode === 'RAIN' ? 0.14 : mode === 'CLOUDY' ? 0.1 : 0;
        fogRef.current.style.opacity = String(fog);
      }

      // lightning
      if (flashRef.current) {
        const since = now - sim.lightningAt;
        const v = since < 90 ? 0.5 : since < 180 ? 0.16 : since < 260 ? 0.32 : 0;
        flashRef.current.style.opacity = String(v);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [sim]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      <div
        ref={fogRef}
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: 0,
          background:
            'radial-gradient(ellipse at 50% 60%, rgba(150,168,184,0.28) 0%, rgba(120,138,155,0.55) 55%, rgba(90,104,120,0.75) 100%)',
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div ref={flashRef} className="absolute inset-0 bg-white" style={{ opacity: 0 }} />
    </div>
  );
}
