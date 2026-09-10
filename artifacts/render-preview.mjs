import fs from 'node:fs';

// Let us create an HTML file that renders the exact canvas marks so we can screenshot it with Playwright
export function createPreviewHtml(marks, width = 1000, height = 700) {
  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; background: #f7f3e8; display: flex; justify-content: center; align-items: center; }
  canvas { background: #f7f3e8; }
</style>
</head>
<body>
<canvas id="c" width="${width}" height="${height}"></canvas>
<script>
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const marks = ${JSON.stringify(marks)};
  ctx.fillStyle = '#f7f3e8';
  ctx.fillRect(0, 0, ${width}, ${height});

  for (const m of marks) {
    ctx.save();
    ctx.globalAlpha = m.opacity ?? 1;
    ctx.fillStyle = m.color ?? '#000';
    ctx.strokeStyle = m.color ?? '#000';
    ctx.lineWidth = m.size ?? 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (m.brush === 'pencil') {
      ctx.globalAlpha *= 0.85;
      ctx.lineWidth = Math.max(1, (m.size ?? 3) * 0.35);
    }

    if (m.type === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(m.x + m.width/2, m.y + m.height/2, m.width/2, m.height/2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.type === 'stroke' && m.points && m.points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(m.points[0][0], m.points[0][1]);
      for (let i = 1; i < m.points.length; i++) {
        ctx.lineTo(m.points[i][0], m.points[i][1]);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
</script>
</body>
</html>`;
}
console.log("Helper ready");
