export class ChallengeJudge {
  static evaluate(level, engine) {
    const results = [];
    let allPassed = true;

    for (const goal of level.goals) {
      const result = this._checkGoal(goal, engine);
      results.push(result);
      if (!result.passed) allPassed = false;
    }

    const initialCells = engine._initialCells || engine.countCells();
    const score = allPassed ? this._calculateScore(level, initialCells) : 0;

    const stats = engine.getStats();

    return {
      passed: allPassed,
      goals: results,
      score,
      stats: {
        peakCells: stats.peakCells,
        peakGeneration: stats.peakGeneration,
        finalCells: stats.currentCells,
        finalGeneration: stats.generation,
        isPeriodic: stats.isPeriodic,
        periodLength: stats.periodLength,
        periodStartGen: stats.periodStartGen,
        initialCells
      }
    };
  }

  static checkAllGoals(level, engine) {
    for (const goal of level.goals) {
      const result = this._checkGoal(goal, engine);
      if (!result.passed) return false;
    }
    return true;
  }

  static _checkGoal(goal, engine) {
    switch (goal.type) {
      case 'minAlive':
        return this._checkMinAlive(goal, engine);
      case 'maxAlive':
        return this._checkMaxAlive(goal, engine);
      case 'rangeAlive':
        return this._checkRangeAlive(goal, engine);
      case 'allDead':
        return this._checkAllDead(goal, engine);
      case 'regionAlive':
        return this._checkRegionAlive(goal, engine);
      case 'periodic':
        return this._checkPeriodic(goal, engine);
      default:
        return { passed: false, label: goal.label || '未知条件', detail: '不支持的目标类型' };
    }
  }

  static _checkMinAlive(goal, engine) {
    const count = engine.countCells();
    const passed = count >= goal.value;
    return {
      passed,
      label: goal.label || `活细胞数 ≥ ${goal.value}`,
      detail: `当前: ${count} / 目标: ${goal.value}`
    };
  }

  static _checkMaxAlive(goal, engine) {
    const count = engine.countCells();
    const passed = count <= goal.value;
    return {
      passed,
      label: goal.label || `活细胞数 ≤ ${goal.value}`,
      detail: `当前: ${count} / 上限: ${goal.value}`
    };
  }

  static _checkRangeAlive(goal, engine) {
    const count = engine.countCells();
    const passed = count >= goal.min && count <= goal.max;
    return {
      passed,
      label: goal.label || `活细胞数 ${goal.min}-${goal.max}`,
      detail: `当前: ${count} / 范围: ${goal.min}-${goal.max}`
    };
  }

  static _checkAllDead(goal, engine) {
    const count = engine.countCells();
    const passed = count === 0;
    return {
      passed,
      label: goal.label || '全部细胞消亡',
      detail: `剩余: ${count} 个活细胞`
    };
  }

  static _checkRegionAlive(goal, engine) {
    const count = engine.countCellsInRegion(goal.x1, goal.y1, goal.x2, goal.y2);
    const passed = count >= goal.value;
    return {
      passed,
      label: goal.label || `区域内至少 ${goal.value} 个活细胞`,
      detail: `区域内: ${count} / 目标: ${goal.value}`
    };
  }

  static _checkPeriodic(goal, engine) {
    const stats = engine.getStats();
    const passed = stats.isPeriodic;
    let detail = '未检测到周期';
    if (passed) {
      if (stats.periodLength === 0) {
        detail = '已进入稳定态';
      } else {
        detail = `周期长度: ${stats.periodLength} 代，起始于第 ${stats.periodStartGen} 代`;
      }
    }
    return {
      passed,
      label: goal.label || '进入周期',
      detail
    };
  }

  static _calculateScore(level, usedCells) {
    const maxCells = level.maxCells;
    if (maxCells <= 1) return 100;

    const minPossible = 1;
    if (usedCells <= minPossible) return 100;

    const pointsPerCell = 100 / (maxCells - 1);
    const score = 100 - (usedCells - 1) * pointsPerCell;

    return Math.max(0, Math.round(score));
  }
}
