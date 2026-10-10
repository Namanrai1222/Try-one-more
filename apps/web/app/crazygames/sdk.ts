/** Small SDK boundary: failures and blocked SDK downloads must never prevent play. */
export interface CrazySdk {
  init(): Promise<void>;
  game: {
    settings: { muteAudio?: boolean };
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazySdk };
  }
}

const safely = (call: () => void) => {
  try {
    call();
  } catch {
    // SDK availability must not change game mechanics.
  }
};

export function createCrazyBridge(sdk: CrazySdk | null) {
  let playing = false;
  let loading = true;
  if (sdk) safely(() => sdk.game.loadingStart());
  const loaded = () => {
    if (!loading) return;
    loading = false;
    if (sdk) safely(() => sdk.game.loadingStop());
  };
  return {
    loaded,
    isAudioMuted: () => sdk?.game.settings.muteAudio === true,
    setPlaying(next: boolean) {
      if (next) loaded();
      if (next === playing) return;
      playing = next;
      if (sdk) safely(() => (next ? sdk.game.gameplayStart() : sdk.game.gameplayStop()));
    },
    destroy() {
      loaded();
      if (playing && sdk) safely(() => sdk.game.gameplayStop());
      playing = false;
    },
  };
}

/** Bound both script download and initialization so an ad blocker cannot strand the loader. */
export async function loadCrazySdk(timeoutMs = 4000): Promise<CrazySdk | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let script: HTMLScriptElement | undefined;
  try {
    return await Promise.race([
      (async () => {
        if (!window.CrazyGames?.SDK) {
          await new Promise<void>((resolve, reject) => {
            script = document.createElement('script');
            script.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('SDK unavailable'));
            document.head.appendChild(script);
          });
        }
        const sdk = window.CrazyGames?.SDK;
        if (!sdk) return null;
        await sdk.init();
        return sdk;
      })(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    script?.remove();
  }
}
