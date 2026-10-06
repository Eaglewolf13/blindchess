import { createRoot } from 'react-dom/client';
import App from './App';
import { AppController } from './application/controller';
import { IndexedDbRepository } from './adapters/storage';
import { StockfishEngine } from './adapters/engine';
import { BrowserSpeechOutput, LocalSpeechInput } from './adapters/speech';
import './styles.css';

const output = new BrowserSpeechOutput();
const engine = new StockfishEngine();
const input = new LocalSpeechInput(output);
const controller = new AppController(new IndexedDbRepository(), engine, output);
window.addEventListener('pagehide', () => {
  void input.stop();
  output.stop();
  engine.dispose();
});
createRoot(document.getElementById('root')!).render(<App controller={controller} speech={input} />);
