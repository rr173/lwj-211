export const LEVELS = [
  {
    id: 'level_1',
    name: '存活',
    description: '放置初始细胞，让它们在100代后仍然存活。',
    rule: 'B3/S23',
    width: 50,
    height: 50,
    maxCells: 5,
    maxSteps: 100,
    difficulty: 1,
    forbidden: [],
    goals: [
      { type: 'minAlive', value: 1, label: '最终活细胞数 ≥ 1' }
    ]
  },
  {
    id: 'level_2',
    name: '扩张',
    description: '让细胞群扩张壮大，100代后活细胞数超过20个。',
    rule: 'B3/S23',
    width: 50,
    height: 50,
    maxCells: 5,
    maxSteps: 100,
    difficulty: 2,
    forbidden: [],
    goals: [
      { type: 'minAlive', value: 20, label: '最终活细胞数 ≥ 20' }
    ]
  },
  {
    id: 'level_3',
    name: '精准灭亡',
    description: '放置细胞让它们在50代内完全消亡。',
    rule: 'B3/S23',
    width: 30,
    height: 30,
    maxCells: 10,
    maxSteps: 50,
    difficulty: 2,
    forbidden: [],
    goals: [
      { type: 'allDead', label: '全部细胞消亡' }
    ]
  },
  {
    id: 'level_4',
    name: '送达',
    description: '左半区域是禁区，只能在右半部分放置细胞。让细胞演化200代后到达右侧10列区域。',
    rule: 'B3/S23',
    width: 80,
    height: 40,
    maxCells: 8,
    maxSteps: 200,
    difficulty: 3,
    forbidden: [
      { x1: 0, y1: 0, x2: 39, y2: 39 }
    ],
    goals: [
      { type: 'regionAlive', value: 1, x1: 70, y1: 0, x2: 79, y2: 39, label: '右侧10列内至少1个活细胞' }
    ]
  },
  {
    id: 'level_5',
    name: '人口控制',
    description: '使用高生命规则(B36/S23)，让最终细胞数控制在10到30之间。',
    rule: 'B36/S23',
    width: 40,
    height: 40,
    maxCells: 15,
    maxSteps: 150,
    difficulty: 3,
    forbidden: [],
    goals: [
      { type: 'rangeAlive', min: 10, max: 30, label: '最终活细胞数在10-30之间' }
    ]
  },
  {
    id: 'level_6',
    name: '稳定器',
    description: '构建一个稳定结构或振荡器，200代后进入周期状态。',
    rule: 'B3/S23',
    width: 40,
    height: 40,
    maxCells: 8,
    maxSteps: 200,
    difficulty: 4,
    forbidden: [],
    goals: [
      { type: 'periodic', label: '进入周期（稳定态或振荡）' }
    ]
  },
  {
    id: 'level_7',
    name: '屏障突破',
    description: '中间一排禁区将画布分为上下两半。只能在上半部分放置细胞，让它们突破屏障到达下半部分。',
    rule: 'B3/S23',
    width: 60,
    height: 60,
    maxCells: 12,
    maxSteps: 150,
    difficulty: 4,
    forbidden: [
      { x1: 0, y1: 29, x2: 59, y2: 30 }
    ],
    goals: [
      { type: 'regionAlive', value: 5, x1: 0, y1: 31, x2: 59, y2: 59, label: '下半区域至少5个活细胞' }
    ],
    placementZone: { x1: 0, y1: 0, x2: 59, y2: 28 }
  },
  {
    id: 'level_8',
    name: '终极挑战',
    description: '在100x100的画布上，仅用20个初始细胞，300代后活细胞数超过100。',
    rule: 'B3/S23',
    width: 100,
    height: 100,
    maxCells: 20,
    maxSteps: 300,
    difficulty: 5,
    forbidden: [],
    goals: [
      { type: 'minAlive', value: 100, label: '最终活细胞数 ≥ 100' }
    ]
  }
];
