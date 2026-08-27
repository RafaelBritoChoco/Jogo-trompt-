const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sourcePath = path.join(__dirname, 'browser-audit.cjs');
const generatedPath = path.join(__dirname, '.generated-v2-audit.cjs');
let source = fs.readFileSync(sourcePath, 'utf8');

source = source.replace(
  "const BASE = 'http://127.0.0.1:8765/curvebreak/index.html';",
  "const BASE = 'http://127.0.0.1:8765/curvebreak/v2/index.html';",
);

source = source.replace(
  "await waitFor(page, () => window.__CURVEBREAK_BOOTED__ === true, `${name}: game did not boot`, 20000);",
  "await waitFor(page, () => window.__CURVEBREAK_BOOTED__ === true && window.__CURVEBREAK_PATCHED__ === true, `${name}: patched game did not boot`, 20000);",
);

source = source.replaceAll(
  "const player = window.__CURVEBREAK_DIAGNOSTICS__.player;\n      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.3, player.x, player.y);",
  "const player = window.__CURVEBREAK_DIAGNOSTICS__.player;\n      const paddle = window.__CURVEBREAK_GAME__.player;\n      paddle.x = player.x; paddle.y = player.y;\n      paddle.targetX = player.x; paddle.targetY = player.y;\n      paddle.vx = 0; paddle.vy = 0;\n      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.3, player.x, player.y);",
);

source = source.replace(
  "    await activate(page, touch, '#pauseBtn');",
  "    await page.evaluate(() => {\n      const enemy = window.__CURVEBREAK_DIAGNOSTICS__.enemy;\n      window.__CURVEBREAK_TEST_HOOKS__.approachEnemy(0.7, enemy.x, enemy.y);\n    });\n    await activate(page, touch, '#pauseBtn');",
);

fs.writeFileSync(generatedPath, source);
const result = spawnSync(process.execPath, [generatedPath], {
  cwd: path.resolve(__dirname, '..', '..'),
  env: process.env,
  stdio: 'inherit',
});
try { fs.unlinkSync(generatedPath); } catch (_) {}
process.exit(result.status == null ? 1 : result.status);
