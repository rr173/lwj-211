import { CellStore } from './core/CellStore.js';
import { ColonyManager } from './core/Colony.js';
import { ViewState } from './core/ViewState.js';
import { EvolutionEngine } from './engine/EvolutionEngine.js';
import { PatternManager } from './engine/PatternManager.js';
import { Renderer } from './rendering/Renderer.js';
import { InputHandler } from './input/InputHandler.js';
import { UIManager } from './ui/UIManager.js';

function init() {
  const cellStore = new CellStore();
  const colonyManager = new ColonyManager();
  const viewState = new ViewState();
  const patternManager = new PatternManager(cellStore, colonyManager);
  const engine = new EvolutionEngine(cellStore, colonyManager);

  const canvas = document.getElementById('grid-canvas');

  const renderer = new Renderer(canvas, cellStore, viewState, colonyManager);
  const inputHandler = new InputHandler(canvas, viewState, cellStore, colonyManager, patternManager);
  const uiManager = new UIManager(colonyManager, engine, patternManager, cellStore, viewState);
  uiManager.setRenderer(renderer);

  window.__app = {
    cellStore,
    colonyManager,
    viewState,
    patternManager,
    engine,
    renderer,
    uiManager
  };

  renderer.render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
