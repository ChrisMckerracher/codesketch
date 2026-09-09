// An original, deterministic study made entirely from editable paint commands.
export function landscape() {
  const commands = [{ type: 'fill', color: '#eee7d7' },
    { type: 'layer.add', id: 'distance', name: '01 · Atmosphere' },
    { type: 'layer.add', id: 'land', name: '02 · Rolling hills' },
    { type: 'layer.add', id: 'details', name: '03 · Light & grasses' }];
  let seed = 17;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const stroke = (layer, points, color, size, opacity = 1, brush = 'brush') =>
    commands.push({ type: 'stroke', layer, points, color, size, opacity, brush });
  for (let y = 22; y < 365; y += 23) {
    stroke('distance', [[10, y], [260, y + 8], [550, y - 3], [990, y + 7]],
      y < 160 ? '#acbfc0' : y < 280 ? '#c8cec3' : '#e5d5b9', 64, 0.72);
  }
  commands.push({ type: 'ellipse', layer: 'distance', x: 718, y: 114, width: 85, height: 85, color: '#f5dba0', opacity: 0.9 });
  for (let i = 0; i < 3; i++) {
    stroke('distance', [[125 + i * 150, 115 + i * 24], [215 + i * 145, 109 + i * 23], [330 + i * 145, 117 + i * 23]], '#f2ede0', 14, 0.6);
  }
  const hills = [
    { color: '#879d98', top: 328, amp: 52, phase: 0, bottom: 480 },
    { color: '#526f69', top: 406, amp: 74, phase: 2, bottom: 568 },
    { color: '#a6a778', top: 486, amp: 56, phase: 4, bottom: 650 },
    { color: '#374f43', top: 599, amp: 52, phase: 1, bottom: 699 },
  ];
  for (const hill of hills) {
    for (let offset = 0; offset < hill.bottom - hill.top + 65; offset += 20) {
      const points = Array.from({ length: 26 }, (_, i) => {
        const x = i * 40;
        return [x, Math.min(699, Math.max(0, hill.top + Math.sin(i / 6 + hill.phase) * hill.amp + offset))];
      });
      stroke('land', points, hill.color, 52, 0.95);
    }
  }
  for (let i = 0; i < 30; i++) {
    const x = 40 + random() * 920, y = 465 + random() * 210;
    stroke('details', [[x, y], [Math.min(999, x + 15 + random() * 50), y - 3]], '#d2c58c', 3 + random() * 7, 0.48);
  }
  for (let i = 0; i < 32; i++) {
    const x = 15 + random() * 970, y = 655 + random() * 43;
    stroke('details', [[x, y], [Math.min(999, x + random() * 16), y - 18 - random() * 45]], i % 3 ? '#b5b187' : '#ded1a0', 3, 0.75, 'pencil');
  }
  return commands;
}
