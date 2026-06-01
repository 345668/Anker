"use client";

import { useEffect, useRef } from "react";

export function AnimatedTesseract() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const chars = "░▒▓█▀▄▌▐│─┤├┴┬╭╮╰╯";
    let time = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    // 4D Tesseract (hypercube) vertices - 16 vertices
    const vertices4D = [
      // Inner cube
      { x: -1, y: -1, z: -1, w: -1 },
      { x: 1, y: -1, z: -1, w: -1 },
      { x: 1, y: 1, z: -1, w: -1 },
      { x: -1, y: 1, z: -1, w: -1 },
      { x: -1, y: -1, z: 1, w: -1 },
      { x: 1, y: -1, z: 1, w: -1 },
      { x: 1, y: 1, z: 1, w: -1 },
      { x: -1, y: 1, z: 1, w: -1 },
      // Outer cube
      { x: -1, y: -1, z: -1, w: 1 },
      { x: 1, y: -1, z: -1, w: 1 },
      { x: 1, y: 1, z: -1, w: 1 },
      { x: -1, y: 1, z: -1, w: 1 },
      { x: -1, y: -1, z: 1, w: 1 },
      { x: 1, y: -1, z: 1, w: 1 },
      { x: 1, y: 1, z: 1, w: 1 },
      { x: -1, y: 1, z: 1, w: 1 },
    ];

    // Edges connecting the 16 vertices (32 edges total)
    const edges = [
      // Inner cube edges
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
      // Outer cube edges
      [8, 9], [9, 10], [10, 11], [11, 8],
      [12, 13], [13, 14], [14, 15], [15, 12],
      [8, 12], [9, 13], [10, 14], [11, 15],
      // Connecting edges between inner and outer cubes
      [0, 8], [1, 9], [2, 10], [3, 11],
      [4, 12], [5, 13], [6, 14], [7, 15],
    ];

    // 4D rotation matrices
    const rotateXY = (v: { x: number; y: number; z: number; w: number }, angle: number) => ({
      x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
      y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
      z: v.z,
      w: v.w,
    });

    const rotateXZ = (v: { x: number; y: number; z: number; w: number }, angle: number) => ({
      x: v.x * Math.cos(angle) - v.z * Math.sin(angle),
      y: v.y,
      z: v.x * Math.sin(angle) + v.z * Math.cos(angle),
      w: v.w,
    });

    const rotateXW = (v: { x: number; y: number; z: number; w: number }, angle: number) => ({
      x: v.x * Math.cos(angle) - v.w * Math.sin(angle),
      y: v.y,
      z: v.z,
      w: v.x * Math.sin(angle) + v.w * Math.cos(angle),
    });

    const rotateYZ = (v: { x: number; y: number; z: number; w: number }, angle: number) => ({
      x: v.x,
      y: v.y * Math.cos(angle) - v.z * Math.sin(angle),
      z: v.y * Math.sin(angle) + v.z * Math.cos(angle),
      w: v.w,
    });

    const rotateYW = (v: { x: number; y: number; z: number; w: number }, angle: number) => ({
      x: v.x,
      y: v.y * Math.cos(angle) - v.w * Math.sin(angle),
      z: v.z,
      w: v.y * Math.sin(angle) + v.w * Math.cos(angle),
    });

    const rotateZW = (v: { x: number; y: number; z: number; w: number }, angle: number) => ({
      x: v.x,
      y: v.y,
      z: v.z * Math.cos(angle) - v.w * Math.sin(angle),
      w: v.z * Math.sin(angle) + v.w * Math.cos(angle),
    });

    // Project 4D to 3D using stereographic projection
    const project4Dto3D = (v: { x: number; y: number; z: number; w: number }, distance: number) => {
      const w = 1 / (distance - v.w);
      return {
        x: v.x * w,
        y: v.y * w,
        z: v.z * w,
        depth: v.w,
      };
    };

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const scale = Math.min(rect.width, rect.height) * 0.3;

      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const points: { x: number; y: number; z: number; depth: number; char: string }[] = [];

      // Apply 4D rotations and project to 3D
      edges.forEach(([i, j]) => {
        let v1 = { ...vertices4D[i] };
        let v2 = { ...vertices4D[j] };

        // Apply 4D rotations
        v1 = rotateXY(v1, time * 0.3);
        v1 = rotateXZ(v1, time * 0.25);
        v1 = rotateXW(v1, time * 0.4);
        v1 = rotateYZ(v1, time * 0.2);
        v1 = rotateZW(v1, time * 0.35);

        v2 = rotateXY(v2, time * 0.3);
        v2 = rotateXZ(v2, time * 0.25);
        v2 = rotateXW(v2, time * 0.4);
        v2 = rotateYZ(v2, time * 0.2);
        v2 = rotateZW(v2, time * 0.35);

        // Project to 3D
        const p1 = project4Dto3D(v1, 3);
        const p2 = project4Dto3D(v2, 3);

        // Generate points along edge
        for (let t = 0; t <= 1; t += 0.08) {
          const x = p1.x + (p2.x - p1.x) * t;
          const y = p1.y + (p2.y - p1.y) * t;
          const z = p1.z + (p2.z - p1.z) * t;
          const depth = p1.depth + (p2.depth - p1.depth) * t;

          const normalizedDepth = (depth + 1.5) / 3;
          const charIndex = Math.floor(normalizedDepth * (chars.length - 1));

          points.push({
            x: centerX + x * scale,
            y: centerY - y * scale,
            z,
            depth,
            char: chars[Math.max(0, Math.min(charIndex, chars.length - 1))],
          });
        }
      });

      // Add vertex points for emphasis
      vertices4D.forEach((vertex) => {
        let v = { ...vertex };
        v = rotateXY(v, time * 0.3);
        v = rotateXZ(v, time * 0.25);
        v = rotateXW(v, time * 0.4);
        v = rotateYZ(v, time * 0.2);
        v = rotateZW(v, time * 0.35);

        const p = project4Dto3D(v, 3);
        const normalizedDepth = (p.depth + 1.5) / 3;
        const charIndex = Math.floor(normalizedDepth * (chars.length - 1));

        points.push({
          x: centerX + p.x * scale,
          y: centerY - p.y * scale,
          z: p.z,
          depth: p.depth,
          char: "█",
        });
      });

      // Sort by depth for proper rendering
      points.sort((a, b) => a.depth - b.depth);

      // Draw points
      points.forEach((point) => {
        const alpha = 0.15 + ((point.depth + 1.5) / 3) * 0.6;
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(alpha, 0.95)})`;
        ctx.fillText(point.char, point.x, point.y);
      });

      time += 0.012;
      frameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
}
