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
import { AnalyzerUI } from './analyzer/AnalyzerUI.js';
import { PatternLibrary } from './patterns/PatternLibrary.js';
import { PatternRecognizer } from './patterns/PatternRecognizer.js';
import { PatternLibraryUI } from './patterns/PatternLibraryUI.js';
import { TerrainLayer } from './terrain/TerrainLayer.js';

function init() {
  const cellStore = new CellStore();
  const colonyManager = new ColonyManager();
  const viewState = new ViewState();
  const resourceField = new ResourceField();
  const terrainLayer = new TerrainLayer();
  const patternManager = new PatternManager(cellStore, colonyManager);
  const engine = new EvolutionEngine(cellStore, colonyManager, resourceField, terrainLayer);
  const historyManager = new HistoryManager(cellStore, colonyManager, engine, resourceField, terrainLayer);
  engine.setHistoryManager(historyManager);

  const patternLibrary = new PatternLibrary();
  const patternRecognizer = new PatternRecognizer(cellStore, colonyManager, patternLibrary);

  const geneLab = new GeneLab();
  const arena = new Arena(200, 200, patternLibrary);

  const canvas = document.getElementById('grid-canvas');

  const renderer = new Renderer(canvas, cellStore, viewState, colonyManager, resourceField, terrainLayer);
  const inputHandler = new InputHandler(canvas, viewState, cellStore, colonyManager, patternManager, historyManager, resourceField, terrainLayer);
  const uiManager = new UIManager(colonyManager, engine, patternManager, cellStore, viewState, historyManager, resourceField, patternLibrary, terrainLayer);
  uiManager.setRenderer(renderer);

  const geneLabUI = new GeneLabUI(geneLab, 'genelab-container', patternLibrary, patternRecognizer);
  const arenaUI = new ArenaUI(arena, geneLab, 'arena-container');
  const analyzerUI = new AnalyzerUI(colonyManager, geneLab, 'analyzer-container');
  const patternLibraryUI = new PatternLibraryUI(patternLibrary, patternManager, 'library-container');

  window.__app = {
    cellStore,
    colonyManager,
    viewState,
    resourceField,
    terrainLayer,
    patternManager,
    engine,
    historyManager,
    patternLibrary,
    patternRecognizer,
    patternLibraryUI,
    renderer,
    inputHandler,
    uiManager,
    geneLab,
    arena,
    geneLabUI,
    arenaUI,
    analyzerUI
  };

  eventBus.on('terrain:changed', () => {
    uiManager.updatePortalPairList();
  });

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
