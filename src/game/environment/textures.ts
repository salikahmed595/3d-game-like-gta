import * as THREE from "three";

// Procedural canvas textures keep the scene free of external image/font downloads.
export function makeTextTexture(lines: { text: string; size: number; color: string; weight?: number }[], w = 1024, h = 256, bg: string | null = null): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const total = lines.reduce((a, l) => a + l.size * 1.2, 0);
    let y = (h - total) / 2;
    for (const l of lines) {
      ctx.font = `${l.weight ?? 800} ${l.size}px "Segoe UI", Arial, sans-serif`;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, w / 2, y + l.size * 0.6);
      y += l.size * 1.2;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeSkylineTexture(): THREE.CanvasTexture {
  const w = 512, h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#2a5fa8"); g.addColorStop(0.7, "#ffb36b"); g.addColorStop(1, "#ffd9a0");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer === 0 ? "#3b4a6b" : "#1d2640";
      for (let x = 0; x < w; x += 26 + rnd() * 20) {
        const bh = 50 + rnd() * (layer === 0 ? 90 : 140);
        const bw = 22 + rnd() * 26;
        ctx.fillRect(x, h - bh, bw, bh);
        if (layer === 1) {
          ctx.fillStyle = "#ffe08a";
          for (let wy = h - bh + 8; wy < h - 6; wy += 14) if (rnd() > 0.5) ctx.fillRect(x + 5, wy, 4, 6);
          ctx.fillStyle = "#1d2640";
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
