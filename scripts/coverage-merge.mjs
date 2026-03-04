import fs from 'fs';
import path from 'path';
import istanbulLibCoverage from 'istanbul-lib-coverage';

const { createCoverageMap } = istanbulLibCoverage;

const CWD = process.cwd();
const MAIN_COVERAGE = path.join(CWD, 'coverage', 'main', 'coverage-final.json');
const RENDERER_COVERAGE = path.join(CWD, 'coverage', 'renderer', 'coverage-final.json');
const OUT_DIR = path.join(CWD, 'coverage', 'merged');

const ensureFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Coverage file not found: ${filePath}`);
  }
};

const isBusinessFile = (filePath) => {
  const normalized = filePath.replace(/\\/g, '/');

  if (!normalized.includes('/src/')) return false;
  if (normalized.includes('/__tests__/')) return false;
  if (/\.test\.[tj]sx?$/.test(normalized)) return false;
  if (/\.d\.ts$/.test(normalized)) return false;

  // Startup shell files and barrels/type-only files that distort effective business coverage
  if (/\/src\/(main|preload)\/index\.ts$/.test(normalized)) return false;
  if (/\/src\/renderer\/(main\.tsx|App\.tsx)$/.test(normalized)) return false;
  if (/\/src\/.*\/index\.ts$/.test(normalized)) return false;
  if (/Definition\.tsx?$/.test(normalized)) return false;
  if (/\/src\/shared\/types\//.test(normalized)) return false;

  return true;
};

const isSrcFile = (filePath) => {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes('/src/')
    && !normalized.includes('/__tests__/')
    && !/\.test\.[tj]sx?$/.test(normalized)
    && !/\.d\.ts$/.test(normalized);
};

const aggregate = (coverageMap, filter) => {
  const totals = {
    lines: { total: 0, covered: 0 },
    statements: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
    files: 0,
  };

  const perFile = [];

  for (const file of coverageMap.files()) {
    if (!filter(file)) continue;

    const summary = coverageMap.fileCoverageFor(file).toSummary();
    const uncovered = summary.lines.total - summary.lines.covered;

    totals.lines.total += summary.lines.total;
    totals.lines.covered += summary.lines.covered;
    totals.statements.total += summary.statements.total;
    totals.statements.covered += summary.statements.covered;
    totals.functions.total += summary.functions.total;
    totals.functions.covered += summary.functions.covered;
    totals.branches.total += summary.branches.total;
    totals.branches.covered += summary.branches.covered;
    totals.files += 1;

    perFile.push({
      file,
      linesPct: summary.lines.pct,
      branchesPct: summary.branches.pct,
      functionsPct: summary.functions.pct,
      statementsPct: summary.statements.pct,
      uncoveredLines: uncovered,
      totalLines: summary.lines.total,
      coveredLines: summary.lines.covered,
    });
  }

  const pct = (covered, total) => (total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2)));

  return {
    totals: {
      lines: pct(totals.lines.covered, totals.lines.total),
      statements: pct(totals.statements.covered, totals.statements.total),
      functions: pct(totals.functions.covered, totals.functions.total),
      branches: pct(totals.branches.covered, totals.branches.total),
      files: totals.files,
      lineCounts: totals.lines,
      statementCounts: totals.statements,
      functionCounts: totals.functions,
      branchCounts: totals.branches,
    },
    topUncovered: perFile
      .filter((f) => f.totalLines >= 30)
      .sort((a, b) => b.uncoveredLines - a.uncoveredLines)
      .slice(0, 20),
  };
};

try {
  ensureFile(MAIN_COVERAGE);
  ensureFile(RENDERER_COVERAGE);

  const main = JSON.parse(fs.readFileSync(MAIN_COVERAGE, 'utf8'));
  const renderer = JSON.parse(fs.readFileSync(RENDERER_COVERAGE, 'utf8'));

  const map = createCoverageMap({});
  map.merge(main);
  map.merge(renderer);

  const srcSummary = aggregate(map, isSrcFile);
  const businessSummary = aggregate(map, isBusinessFile);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'src-summary.json'), JSON.stringify(srcSummary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'business-summary.json'), JSON.stringify(businessSummary, null, 2));

  console.log('[coverage-merge] merged reports generated');
  console.log('[coverage-merge] src scope:', srcSummary.totals);
  console.log('[coverage-merge] business scope:', businessSummary.totals);
} catch (error) {
  console.error('[coverage-merge] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
