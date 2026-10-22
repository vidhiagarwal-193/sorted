"use client";

import type { MediaPart } from "./ai";

// Prepares uploaded creatives in the browser so they fit in one request (Vercel accepts about 4.5 MB):
// images are resized, short videos are sent whole, longer videos are sampled into still frames.

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const WHOLE_VIDEO_MAX_BYTES = 3_000_000; // bigger than this and we send frames instead
const MAX_FRAMES = 12;

export function mmss(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(blob);
  });
}

function drawToJpeg(source: CanvasImageSource, w: number, h: number, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process this image.");
  ctx.fillStyle = "#fff"; // transparent PNGs get a white background, like on Instagram
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function prepareImage(file: File, maxSide: number, quality = 0.8): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error(`"${file.name}" couldn't be opened as an image.`);
    });
    return drawToJpeg(img, img.naturalWidth, img.naturalHeight, maxSide, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type PreparedVideo = {
  duration: number;
  whole: MediaPart | null; // the full video, when it's small enough to send
  frames: MediaPart[]; // still frames, always prepared as a fallback
};

export async function prepareVideo(file: File): Promise<PreparedVideo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () =>
        reject(new Error("This video can't be read in your browser. Export it as an MP4 (H.264) and try again."));
    });
    // Some files (often WebM) don't store their length up front. Seeking far past the end makes the
    // browser work it out.
    if (!Number.isFinite(video.duration)) {
      await new Promise<void>((resolve) => {
        const done = () => Number.isFinite(video.duration) && resolve();
        video.ondurationchange = done;
        video.ontimeupdate = done;
        video.currentTime = 1e9;
        setTimeout(resolve, 5000);
      });
      video.ondurationchange = video.ontimeupdate = null;
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Sorted couldn't work out how long this video is. Export it as an MP4 and try again.");
    }

    const count = Math.min(MAX_FRAMES, Math.max(6, Math.ceil(duration / 2))); // about one frame every 2 seconds
    const frames: MediaPart[] = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : Math.min(duration - 0.05, (i / (count - 1)) * duration);
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = Math.max(0, t);
      });
      frames.push({
        label: `Frame at ${mmss(t)}`,
        kind: "image",
        dataUrl: drawToJpeg(video, video.videoWidth, video.videoHeight, 640, 0.72),
      });
    }

    const whole =
      file.size <= WHOLE_VIDEO_MAX_BYTES && VIDEO_TYPES.includes(file.type)
        ? { label: `Whole video (${mmss(duration)})`, kind: "video" as const, dataUrl: await readAsDataUrl(file) }
        : null;
    return { duration, whole, frames };
  } finally {
    URL.revokeObjectURL(url);
  }
}
