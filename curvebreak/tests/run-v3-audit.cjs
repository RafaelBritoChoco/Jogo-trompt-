const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sourcePath = path.join(__dirname, 'browser-audit.cjs');
const generatedPath = path.join(__dirname, '.generated-v3-audit.cjs');
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

const motionAnchor = "    assert(Math.abs(afterMotion.ball.z - beforeMotion.ball.z) > 3.5, `${name}: ball did not travel in depth`);";
const motionExtension = `${motionAnchor}

    await page.evaluate(() => {
      const game = window.__CURVEBREAK_GAME__;
      game.state = 'play';
      game.ball.heldBy = null;
      game.ball.x = 0; game.ball.y = 0; game.ball.z = 0;
      game.ball.vx = 0; game.ball.vy = 0; game.ball.vz = -35.2;
      game.ball.spinX = 8; game.ball.spinY = 0;
      game.ball.lastHitter = 'player';
      game.ball.trail.length = 0;
    });
    const curveBefore = await diagnostics(page);
    await page.waitForTimeout(240);
    const curveAfter = await diagnostics(page);
    assert(Math.abs(curveAfter.ball.vx) > 1.1, \`${'${name}'}: spin did not accelerate lateral velocity\`);
    assert(Math.abs(curveAfter.ball.x - curveBefore.ball.x) > 0.08, \`${'${name}'}: spin did not bend the flight path\`);`;
source = source.replace(motionAnchor, motionExtension);

const shieldAnchor = `    await waitFor(
      page,
      () => window.__CURVEBREAK_DIAGNOSTICS__?.player.shield === 1,
      \`${'${name}'}: shield did not activate\`,
    );`;
const shieldExtension = `${shieldAnchor}

    const shieldCoreCount = (await diagnostics(page)).player.cores;
    await page.evaluate(() => {
      const state = window.__CURVEBREAK_DIAGNOSTICS__;
      const paddle = window.__CURVEBREAK_GAME__.player;
      paddle.targetX = paddle.x; paddle.targetY = paddle.y; paddle.vx = 0; paddle.vy = 0;
      const missX = Math.min(7.7, state.player.x + 4.35);
      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.24, missX, state.player.y);
    });
    await waitFor(
      page,
      () => window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-shield-save',
      \`${'${name}'}: shield did not absorb a real miss\`,
      5000,
    );
    const shieldAfter = await diagnostics(page);
    assert(shieldAfter.player.cores === shieldCoreCount, \`${'${name}'}: shield save still removed a core\`);
    assert(shieldAfter.player.shield === 0, \`${'${name}'}: shield charge was not consumed\`);

    await page.evaluate(() => {
      window.__CURVEBREAK_TEST_HOOKS__.setWeapon(0);
      const state = window.__CURVEBREAK_DIAGNOSTICS__;
      const paddle = window.__CURVEBREAK_GAME__.player;
      paddle.targetX = paddle.x; paddle.targetY = paddle.y; paddle.vx = 0; paddle.vy = 0;
      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.22, state.player.x + 2.45, state.player.y);
    });
    await waitFor(
      page,
      () => window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-hit',
      \`${'${name}'}: edge impact did not connect\`,
      5000,
    );
    const edgeImpact = await diagnostics(page);
    assert(Math.abs(edgeImpact.ball.vx) > 4.8, \`${'${name}'}: impact region did not create a strong outgoing angle\`);

    await page.evaluate(() => {
      window.__CURVEBREAK_TEST_HOOKS__.setWeapon(1);
      const state = window.__CURVEBREAK_DIAGNOSTICS__;
      const paddle = window.__CURVEBREAK_GAME__.player;
      paddle.targetX = paddle.x; paddle.targetY = paddle.y; paddle.vx = 0; paddle.vy = 0;
      const tipY = Math.min(4.6, state.player.y + 2.1);
      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.22, state.player.x, tipY);
    });
    await waitFor(
      page,
      () => window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-spike-critical',
      \`${'${name}'}: Spike tip did not generate a critical return\`,
      5000,
    );`;
source = source.replace(shieldAnchor, shieldExtension);

fs.writeFileSync(generatedPath, source);
const result = spawnSync(process.execPath, [generatedPath], {
  cwd: path.resolve(__dirname, '..', '..'),
  env: process.env,
  stdio: 'inherit',
});
try { fs.unlinkSync(generatedPath); } catch (_) {}
process.exit(result.status == null ? 1 : result.status);
