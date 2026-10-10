import { describe, expect, it, vi } from 'vitest';
import { createCrazyBridge } from '../app/crazygames/sdk';
import type { CrazySdk } from '../app/crazygames/sdk';

function mockSdk(): CrazySdk {
  return {
    init: vi.fn(async () => {}),
    game: {
      settings: { muteAudio: false },
      loadingStart: vi.fn(),
      loadingStop: vi.fn(),
      gameplayStart: vi.fn(),
      gameplayStop: vi.fn(),
    },
  };
}

describe('CrazyGames lifecycle', () => {
  it('finishes loading before gameplay and reports only status transitions', () => {
    const sdk = mockSdk();
    const bridge = createCrazyBridge(sdk);
    bridge.setPlaying(true);
    bridge.setPlaying(true);
    bridge.loaded();
    expect(sdk.game.loadingStart).toHaveBeenCalledTimes(1);
    expect(sdk.game.loadingStop).toHaveBeenCalledTimes(1);
    expect(sdk.game.gameplayStart).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sdk.game.loadingStop).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(sdk.game.gameplayStart).mock.invocationCallOrder[0]!,
    );
    bridge.setPlaying(false);
    bridge.setPlaying(false);
    bridge.setPlaying(true);
    bridge.destroy();
    expect(sdk.game.gameplayStart).toHaveBeenCalledTimes(2);
    expect(sdk.game.gameplayStop).toHaveBeenCalledTimes(2);
  });

  it('reads the current host mute preference even when it changes', () => {
    const sdk = mockSdk();
    const bridge = createCrazyBridge(sdk);
    expect(bridge.isAudioMuted()).toBe(false);
    sdk.game.settings.muteAudio = true;
    expect(bridge.isAudioMuted()).toBe(true);
  });

  it('works without an SDK and tolerates SDK event errors', () => {
    for (const sdk of [null, mockSdk()]) {
      if (sdk)
        sdk.game.gameplayStart = () => {
          throw new Error('Unavailable');
        };
      const bridge = createCrazyBridge(sdk);
      expect(() => {
        bridge.setPlaying(true);
        bridge.destroy();
      }).not.toThrow();
    }
  });
});
