const STORAGE_KEY = 'cell-automata-challenges';

export class ChallengeProgress {
  static load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load challenge progress:', e);
    }
    return {};
  }

  static save(progress) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      console.error('Failed to save challenge progress:', e);
    }
  }

  static getLevelProgress(levelId) {
    const progress = this.load();
    return progress[levelId] || {
      completed: false,
      bestScore: 0,
      bestCells: null,
      attempts: 0
    };
  }

  static updateLevelProgress(levelId, result) {
    const progress = this.load();
    const levelProgress = progress[levelId] || {
      completed: false,
      bestScore: 0,
      bestCells: null,
      attempts: 0
    };

    levelProgress.attempts++;

    if (result.passed) {
      levelProgress.completed = true;
      if (result.score > levelProgress.bestScore) {
        levelProgress.bestScore = result.score;
        levelProgress.bestCells = result.stats.initialCells;
      }
    }

    progress[levelId] = levelProgress;
    this.save(progress);

    return levelProgress;
  }

  static resetAll() {
    localStorage.removeItem(STORAGE_KEY);
  }
}
