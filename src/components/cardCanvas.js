// src/components/cardCanvas.js
// The ONLY code that touches a canvas. It executes cardLayout's ops and decides nothing.
// Every function here touches the DOM, so call them from effects and handlers only -
// never at render time, which also runs under SSR in the tests.
import { fontString, SHAPES } from "../lib/cardLayout.js";

export function canvasMeasure() {
  const ctx = document.createElement("canvas").getContext("2d");
  return (text, font) => {
    ctx.font = fontString(font);
    return ctx.measureText(text).width;
  };
}

export function backgroundUrl(kind, shape) {
  return `${import.meta.env.BASE_URL}cards/${kind}-${shape}.png`;
}

// Resolves to the image, or rejects with a message the tab shows on the card. A
// background exported at the wrong size is refused, not stretched.
export function loadBackground(kind, shape) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { w, h } = SHAPES[shape];
      if (img.naturalWidth !== w || img.naturalHeight !== h) {
        reject(new Error(`${kind}-${shape}.png is ${img.naturalWidth}×${img.naturalHeight}, expected ${w}×${h}`));
      } else resolve(img);
    };
    img.onerror = () => reject(new Error(`Could not load ${backgroundUrl(kind, shape)}`));
    img.src = backgroundUrl(kind, shape);
  });
}

export function drawCard(canvas, card, background) {
  canvas.width = card.width;
  canvas.height = card.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, card.width, card.height);
  for (const o of card.ops) {
    if (o.op === "image") {
      ctx.drawImage(background, 0, 0);
    } else if (o.op === "rule") {
      ctx.strokeStyle = o.color;
      ctx.lineWidth = o.width;
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y);
      ctx.lineTo(o.x2, o.y);
      ctx.stroke();
    } else if (o.op === "box") {
      ctx.beginPath();
      ctx.roundRect(o.x, o.y, o.w, o.h, o.r);
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 2; ctx.stroke(); }
    } else if (o.op === "text") {
      ctx.font = fontString(o);
      ctx.fillStyle = o.color;
      ctx.textAlign = o.align;
      ctx.textBaseline = "middle";
      ctx.fillText(o.text, o.x, o.y);
    }
  }
}

export function downloadCanvas(canvas, name) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error(`Could not export ${name}`));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return resolve();
    }, "image/png");
  });
}
