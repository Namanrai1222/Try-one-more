import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PlayHost } from '../app/play/[title]/play-host';
import { CrazyHome } from './home';
import '../app/globals.css';

function PortalApp() {
  const [screen, setScreen] = useState<'home' | 'game' | 'daily'>('home');
  if (screen === 'home') {
    return <CrazyHome onPlay={() => setScreen('game')} onDaily={() => setScreen('daily')} />;
  }
  return (
    <PlayHost
      key={screen}
      portal
      startDaily={screen === 'daily'}
      onBack={() => setScreen('home')}
    />
  );
}

createRoot(document.getElementById('root')!).render(<PortalApp />);
