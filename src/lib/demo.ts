import { COLORS } from "@/lib/brand";
import type { PhotoAsset } from "@/types";

/**
 * A sample photo, so the tool can be tried without uploading anything.
 *
 * Drawn on a canvas rather than shipped as a file. It costs nothing to
 * download, it is unmistakably a placeholder so nobody posts it by accident,
 * and it is deliberately a wide landscape with the subject off to one side,
 * which exercises the cover crop the way a real phone photo would.
 */
export async function makeDemoPhoto(): Promise<PhotoAsset> {
  const width = 1400;
  const height = 900;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, COLORS.palm);
  sky.addColorStop(1, "#0a4d45");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Sun, low and to the left, where the "subject" would be.
  const sunX = width * 0.31;
  const sunY = height * 0.46;
  ctx.strokeStyle = COLORS.sun;
  ctx.lineWidth = 4;
  for (let i = 0; i < 16; i++) {
    const rad = (Math.PI * (i * 11 + 186)) / 180;
    ctx.beginPath();
    ctx.moveTo(sunX + Math.cos(rad) * 150, sunY + Math.sin(rad) * 150);
    ctx.lineTo(sunX + Math.cos(rad) * 220, sunY + Math.sin(rad) * 220);
    ctx.stroke();
  }
  ctx.fillStyle = COLORS.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 130, 0, Math.PI * 2);
  ctx.fill();

  // Horizon and a little swell.
  ctx.strokeStyle = COLORS.paper;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 6; i++) {
    const y = height * 0.62 + i * 34;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 70) {
      ctx.quadraticCurveTo(x + 17, y + (i % 2 ? 9 : -9), x + 35, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLORS.paper;
  ctx.font = "600 34px ui-monospace, monospace";
  ctx.fillText("SAMPLE PHOTO", 46, height - 46);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Could not build the sample");

  return {
    url: URL.createObjectURL(blob),
    blob,
    width,
    height,
    focusX: 0.31,
    focusY: 0.46,
    fileName: "sample-photo.jpg",
    zoom: 1,
    rotation: 0,
    flipped: false,
  };
}
