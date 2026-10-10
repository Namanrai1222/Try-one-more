import { createRoot } from 'react-dom/client';
import { PlayHost } from '../app/play/[title]/play-host';
import '../app/globals.css';

createRoot(document.getElementById('root')!).render(<PlayHost portal />);
