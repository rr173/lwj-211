import { CellStore } from './core/CellStore.js';
import { ColonyManager } from './core/Colony.js';
import { ViewState } from './core/ViewState.js';
import { HistoryManager } from './core/HistoryManager.js';
import { ResourceField } from './core/ResourceField.js';
import { EvolutionEngine } from './engine/EvolutionEngine.js';
import { PatternManager } from './engine/PatternManager.js';
import { PatternLibrary } from './patterns/PatternLibrary.js';
import { PatternLibraryUI } from './patterns/PatternLibraryUI.js';
import { PatternRecognizer } from './patterns/PatternRecognizer.js';
import { AnalyzerUI } from './analyzer/AnalyzerUI.js';
import { TerrainLayer } from './terrain/TerrainLayer.js';
import { Renderer } from './rendering/Renderer.js';
import { InputHandler } from './input/InputHandler.js';
import { UIManager } from './ui/UIManager.js';
import { eventBus } from './core/EventBus.js';
import { GeneLab } from './genetics/GeneLab.js';
import { GeneLabUI } from './genetics/GeneLabUI.js';
import { Arena } from './arena/Arena.js';
import { ArenaUI } from './arena/ArenaUI.js';
import { EvolutionLab } from './evolution/EvolutionLab.js';
import { EvolutionLabUI } from './evolution/EvolutionLabUI.js';
import { CollaborationManager } from './collaboration/CollaborationManager.js';
import { CollaborationUI } from './collaboration/CollaborationUI.js';
import { MusicUI } from './music/MusicUI.js';
import { BlueprintManager } from './blueprints/BlueprintManager.js';
import { BlueprintPlacer } from './blueprints/BlueprintPlacer.js';
import { BlueprintUI } from './blueprints/BlueprintUI.js';

function init() {
  const cellStore = new CellStore();
  const colonyManager = new ColonyManager();
  const viewState = new ViewState();
  const resourceField = new ResourceField();
  const patternManager = new PatternManager(cellStore, colonyManager);
  const patternLibrary = new PatternLibrary();
  const terrainLayer = new TerrainLayer();
  const patternRecognizer = new PatternRecognizer(cellStore, colonyManager, patternLibrary);
  const engine = new EvolutionEngine(cellStore, colonyManager, resourceField);
  const historyManager = new HistoryManager(cellStore, colonyManager, engine, resourceField);
  engine.setHistoryManager(historyManager);

  const geneLab = new GeneLab();
  const arena = new Arena(200, 200, patternLibrary);

  const canvas = document.getElementById('grid-canvas');

  const blueprintManager = new BlueprintManager();
  const blueprintPlacer = new BlueprintPlacer(blueprintManager, cellStore, colonyManager);

  const renderer = new Renderer(canvas, cellStore, viewState, colonyManager, resourceField, terrainLayer);
  const inputHandler = new InputHandler(canvas, viewState, cellStore, colonyManager, patternManager, historyManager, resourceField, terrainLayer, blueprintManager, blueprintPlacer);
  const uiManager = new UIManager(colonyManager, engine, patternManager, cellStore, viewState, historyManager, resourceField, patternLibrary, terrainLayer);
  uiManager.setRenderer(renderer);
  inputHandler.setTerrainLayer(terrainLayer);

  const geneLabUI = new GeneLabUI(geneLab, 'genelab-container');
  const patternLibraryUI = new PatternLibraryUI(patternLibrary, patternManager, 'library-container');
  const analyzerUI = new AnalyzerUI(colonyManager, geneLab, 'analyzer-container');
  const arenaUI = new ArenaUI(arena, geneLab, 'arena-container');
  
  const evolutionLab = new EvolutionLab(patternLibrary);
  const evolutionLabUI = new EvolutionLabUI(evolutionLab, 'evolution-container', colonyManager, geneLab, arena);

  const musicUI = new MusicUI(cellStore, viewState, colonyManager, renderer);
  renderer.setMusicScheduler(musicUI.musicScheduler);

  const blueprintUI = new BlueprintUI(blueprintManager, blueprintPlacer, 'blueprints-container', colonyManager, cellStore, viewState);

  const collabManager = new CollaborationManager(
    cellStore, colonyManager, engine, patternManager,
    historyManager, resourceField, terrainLayer
  );
  const collabUI = new CollaborationUI('collab-container', collabManager);
  collabManager.connect();

  window.__app = {
    cellStore,
    colonyManager,
    viewState,
    resourceField,
    patternManager,
    patternLibrary,
    patternRecognizer,
    terrainLayer,
    engine,
    historyManager,
    renderer,
    inputHandler,
    uiManager,
    geneLab,
    arena,
    evolutionLab,
    collabManager,
    collabUI,
    geneLabUI,
    patternLibraryUI,
    analyzerUI,
    arenaUI,
    evolutionLabUI,
    musicUI,
    blueprintManager,
    blueprintPlacer,
    blueprintUI
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
