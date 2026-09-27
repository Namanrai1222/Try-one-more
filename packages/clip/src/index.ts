/**
 * Clip export shared by every title (PRD.md §4.9 "unified clip export", TECH_STACK.md §8 Phase 3).
 *
 * Canvas-only by construction (SECURITY.md §6.1): the only input is a canvas the game drew
 * itself. There is no file input, camera, microphone or screen capture anywhere in here.
 */

/** WhatsApp's limit (PRD.md §6 Phase 3). A clip over this is thrown away for the still card. */
export const MAX_CLIP_BYTES = 15 * 1024 * 1024;

/** Most shareable first: MP4 plays everywhere (WhatsApp, Instagram); WebM is the fallback. */
const VIDEO_TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function pickVideoType(
  isSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
): string | null {
  return VIDEO_TYPES.find(isSupported) ?? null;
}

/**
 * Record `canvas` while `drawFrame(i)` paints frame i; stops when it returns false.
 * MediaRecorder encodes off the main thread; timing is real time, so a 5s clip takes ~5s.
 */
export function recordCanvas(
  canvas: HTMLCanvasElement,
  drawFrame: (frame: number) => boolean,
  opts: { type: string; fps?: number; bitsPerSecond?: number },
): Promise<Blob> {
  const fps = opts.fps ?? 30;
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: opts.type,
    videoBitsPerSecond: opts.bitsPerSecond ?? 2_500_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      resolve(new Blob(chunks, { type: opts.type.split(';')[0] }));
    };
    recorder.onerror = () => reject(new Error('Clip recording failed'));
    let frame = 0;
    let last = -Infinity;
    const tick = (now: number) => {
      if (now - last >= 1000 / fps - 2) {
        last = now;
        if (!drawFrame(frame++)) {
          recorder.stop();
          return;
        }
      }
      requestAnimationFrame(tick);
    };
    drawFrame(frame++);
    recorder.start();
    requestAnimationFrame(tick);
  });
}

export type ShareChannel = 'native' | 'download';

type ShareNav = Partial<Pick<Navigator, 'share' | 'canShare'>>;

export function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The native share sheet where it accepts files (Android, iOS, Windows); otherwise the clip
 * is saved so it can be posted by hand (Instagram has no web share target). `text` carries the
 * link, because several apps drop `url` when files are attached. Null = the player closed
 * the sheet.
 */
export async function shareClip(
  file: File,
  text: string,
  nav: ShareNav = navigator,
  save: (file: File) => void = saveFile,
): Promise<ShareChannel | null> {
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'native';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return null;
      // Any other failure (permission, unsupported target): fall through and save instead.
    }
  }
  save(file);
  return 'download';
}

/** WhatsApp's URL scheme: opens the app (or web) with the message pre-filled. */
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
