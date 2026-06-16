import { CellStore } from './core/CellStore.js';
import { ColonyManager } from './core/Colony.js';
import { ViewState } from './core/ViewState.js';
import { HistoryManager } from './core/HistoryManager.js';
import { ResourceField } from './core/ResourceField.js';
import { EvolutionEngine } from './engine/EvolutionEngine.js';
import { PatternManager } from './engine/PatternManager.js';
import { Renderer } from './rendering/Renderer.js';
import { InputHandler } from './input/InputHandler.js';
import { UIManager } from './ui/UIManager.js';
import { eventBus } from './core/EventBus.js';
import { GeneLab } from './genetics/GeneLab.js';
import { GeneLabUI } from './genetics/GeneLabUI.js';
import { Arena } from './arena/Arena.js';
import { ArenaUI } from './arena/ArenaUI.js';

function init() {
  const cellStore = new CellStore();
  const colonyManager = new ColonyManager();
  const viewState = new ViewState();
  const resourceField = new ResourceField();
  const patternManager = new PatternManager(cellStore, colonyManager);
  const engine = new EvolutionEngine(cellStore, colonyManager, resourceField);
  const historyManager = new HistoryManager(cellStore, colonyManager, engine, resourceField);
  engine.setHistoryManager(historyManager);

  const geneLab = new GeneLab();
  const arena = new Arena(200, 200);

  const canvas = document.getElementById('grid-canvas');

  const renderer = new Renderer(canvas, cellStore, viewState, colonyManager, resourceField);
  const inputHandler = new InputHandler(canvas, viewState, cellStore, colonyManager, patternManager, historyManager, resourceField);
  const uiManager = new UIManager(colonyManager, engine, patternManager, cellStore, viewState, historyManager, resourceField);
  uiManager.setRenderer(renderer);

  const geneLabUI = new GeneLabUI(geneLab, 'genelab-container');
  const arenaUI = new ArenaUI(arena, geneLab, 'arena-container');

  window.__app = {
    cellStore,
    colonyManager,
    viewState,
    resourceField,
    patternManager,
    engine,
    historyManager,
    renderer,
    inputHandler,
    uiManager,
    geneLab,
    arena,
    geneLabUI,
    arenaUI
  };

  setTimeout(() => {
    resourceField.initialize(viewState, 0.3);
    eventBus.emit('state:updated');
  }, 100);

  renderer.render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
