const HEX = /^#?([\da-f]{6})$/i;

export function hexToHsv(hex) {
  const match = HEX.exec(String(hex ?? ""));
  const digits = match ? match[1] : "000000";
  const red = parseInt(digits.slice(0, 2), 16) / 255;
  const green = parseInt(digits.slice(2, 4), 16) / 255;
  const blue = parseInt(digits.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta > 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
    if (hue < 0) hue += 360;
  }
  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}

export function hsvToHex(hue, saturation, value) {
  const h = normalizeHue(hue) % 360;
  const s = unit(saturation);
  const v = unit(value);
  const chroma = v * s;
  const segment = h / 60;
  const second = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = v - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment < 1) [red, green] = [chroma, second];
  else if (segment < 2) [red, green] = [second, chroma];
  else if (segment < 3) [green, blue] = [chroma, second];
  else if (segment < 4) [green, blue] = [second, chroma];
  else if (segment < 5) [red, blue] = [second, chroma];
  else [red, blue] = [chroma, second];

  return `#${channel(red + match)}${channel(green + match)}${channel(blue + match)}`;
}

export function samplePixel(artwork, x, y) {
  const width = Math.floor(Number(artwork?.width));
  const height = Math.floor(Number(artwork?.height));
  if (width < 1 || height < 1 || typeof artwork?.getContext !== "function") return "#000000";
  let context;
  try {
    context = artwork.getContext("2d");
    const px = clampPixel(x, width);
    const py = clampPixel(y, height);
    const data = context?.getImageData(px, py, 1, 1)?.data;
    if (!data || data.length < 3) return "#000000";
    return `#${channel(data[0] / 255)}${channel(data[1] / 255)}${channel(data[2] / 255)}`;
  } catch {
    return "#000000";
  }
}

function normalizeHue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(360, Math.max(0, number)) : 0;
}

function unit(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function clampPixel(value, length) {
  const number = Number(value);
  const pixel = Number.isFinite(number) ? Math.round(number) : 0;
  return Math.min(length - 1, Math.max(0, pixel));
}

function channel(value) {
  const number = Math.round(unit(value) * 255).toString(16);
  return number.padStart(2, "0");
}
