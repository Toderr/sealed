"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  baseAlpha: number;
}

export default function GlobalBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: Particle[] = [];
    const mouse = { x: -9999, y: -9999, active: false };
    const MAX_LINK_DIST = 150;
    const MOUSE_RADIUS = 180;

    function particleCount() {
      const area = width * height;
      return Math.min(140, Math.max(55, Math.round(area / 16000)));
    }

    function spawn(count: number): Particle[] {
      const out: Particle[] = [];
      for (let i = 0; i < count; i++) {
        out.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: Math.random() * 1.3 + 0.8,
          baseAlpha: Math.random() * 0.4 + 0.35,
        });
      }
      return out;
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = width + "px";
      canvas!.style.height = height + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = spawn(particleCount());
    }

    function step() {
      ctx!.clearRect(0, 0, width, height);

      // Draw background gradient wash (very subtle)
      const grad = ctx!.createRadialGradient(
        width * 0.5,
        height * 0.35,
        0,
        width * 0.5,
        height * 0.35,
        Math.max(width, height) * 0.8
      );
      grad.addColorStop(0, "rgba(99,102,241,0.09)");
      grad.addColorStop(0.5, "rgba(56,189,248,0.04)");
      grad.addColorStop(1, "rgba(10,10,10,0)");
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, width, height);

      // Update & draw particles
      for (const p of particles) {
        // Mouse influence
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MOUSE_RADIUS * MOUSE_RADIUS && d2 > 0.5) {
            const d = Math.sqrt(d2);
            const force = (MOUSE_RADIUS - d) / MOUSE_RADIUS;
            p.vx += (dx / d) * force * 0.08;
            p.vy += (dy / d) * force * 0.08;
          }
        }

        // Gentle friction toward base speed
        p.vx *= 0.985;
        p.vy *= 0.985;

        p.x += p.vx;
        p.y += p.vy;

        // Wrap edges
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        // Draw particle with glow
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(165,180,252,${p.baseAlpha})`;
        ctx!.fill();
      }

      // Draw links
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MAX_LINK_DIST * MAX_LINK_DIST) {
            const alpha = (1 - Math.sqrt(d2) / MAX_LINK_DIST) * 0.22;
            ctx!.strokeStyle = `rgba(129,140,248,${alpha})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }

        // Link to mouse cursor
        if (mouse.active) {
          const dx = a.x - mouse.x;
          const dy = a.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MOUSE_RADIUS * MOUSE_RADIUS) {
            const alpha = (1 - Math.sqrt(d2) / MOUSE_RADIUS) * 0.55;
            ctx!.strokeStyle = `rgba(199,210,254,${alpha})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(mouse.x, mouse.y);
            ctx!.stroke();
          }
        }
      }
    }

    let raf = 0;
    function loop() {
      step();
      raf = requestAnimationFrame(loop);
    }

    function onMove(e: MouseEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    }
    function onLeave() {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseleave", onLeave);

    if (reduced) {
      // Render once, no loop
      step();
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.10), transparent 60%), radial-gradient(ellipse at 50% 100%, rgba(10,10,10,0.8), transparent 70%)",
        }}
      />
    </div>
  );
}
