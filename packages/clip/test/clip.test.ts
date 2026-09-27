import { describe, expect, it, vi } from 'vitest';
import { pickVideoType, shareClip, whatsappUrl } from '../src/index.ts';

const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

describe('pickVideoType', () => {
  it('prefers MP4, falls back to WebM, and reports no support as null', () => {
    expect(pickVideoType(() => true)).toBe('video/mp4;codecs=avc1');
    expect(pickVideoType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9');
    expect(pickVideoType(() => false)).toBeNull();
  });
});

describe('shareClip', () => {
  it('uses the native sheet when it accepts files', async () => {
    const share = vi.fn(async () => {});
    const save = vi.fn();
    const channel = await shareClip(file, 'hi https://x', { share, canShare: () => true }, save);
    expect(channel).toBe('native');
    expect(share).toHaveBeenCalledWith({ files: [file], text: 'hi https://x' });
    expect(save).not.toHaveBeenCalled();
  });

  it('returns null when the player closes the sheet', async () => {
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    const share = vi.fn(async () => Promise.reject(abort));
    const save = vi.fn();
    expect(await shareClip(file, 't', { share, canShare: () => true }, save)).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('saves the file when files cannot be shared or sharing fails', async () => {
    const save = vi.fn();
    expect(await shareClip(file, 't', {}, save)).toBe('download');
    const broken = vi.fn(async () => Promise.reject(new Error('NotAllowed')));
    expect(await shareClip(file, 't', { share: broken, canShare: () => true }, save)).toBe(
      'download',
    );
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('whatsappUrl', () => {
  it('encodes the message', () => {
    expect(whatsappUrl('I died 3 times & https://a.b/c/rage-1-3')).toBe(
      'https://wa.me/?text=I%20died%203%20times%20%26%20https%3A%2F%2Fa.b%2Fc%2Frage-1-3',
    );
  });
});
