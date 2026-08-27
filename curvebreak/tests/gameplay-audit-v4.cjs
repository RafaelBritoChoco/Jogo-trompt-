const { chromium, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = 'http://127.0.0.1:8765/curvebreak/v2/index.html';
const PLAYER_PLANE = 17.6 - 0.46;
const EVIDENCE = path.join(ROOT, 'curvebreak', 'evidence-v4');
const results = [];

function assert(value, message) {
  if (!value) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readDiagnostics(page) {
  return page.evaluate(() => window.__CURVEBREAK_DIAGNOSTICS__ ?? null).catch(() => null);
}

async function waitFor(page, predicate, message, timeout = 10000, argument = null) {
  try {
    await page.waitForFunction(predicate, argument, { timeout });
  } catch (error) {
    const state = await readDiagnostics(page);
    throw new Error(`${message}; diagnostics=${JSON.stringify(state)}`);
  }
}

async function activate(page, touch, selector) {
  const control = page.locator(selector);
  if (touch) await control.tap({ timeout: 8000 });
  else await control.click({ timeout: 8000 });
}

async function parryAtImpact(page, touch) {
  await waitFor(
    page,
    plane => {
      const ball = window.__CURVEBREAK_DIAGNOSTICS__?.ball;
      if (!ball || ball.vz <= 0) return false;
      const timeToImpact = (plane - ball.z) / ball.vz;
      return timeToImpact > 0 && timeToImpact < 0.082;
    },
    'ball never reached the real parry window',
    5000,
    PLAYER_PLANE,
  );
  await activate(page, touch, '#parryBtn');
}

function overlapArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

async function stabilizePlayer(page) {
  await page.evaluate(() => {
    const paddle = window.__CURVEBREAK_GAME__.player;
    paddle.targetX = paddle.x;
    paddle.targetY = paddle.y;
    paddle.vx = 0;
    paddle.vy = 0;
  });
}

async function runCase(browser, engine, viewport, touch) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: touch ? 2 : 1,
    hasTouch: touch,
    isMobile: touch,
    locale: 'pt-BR',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const browserErrors = [];
  const failedRequests = [];

  page.on('pageerror', error => browserErrors.push(`page:${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`console:${message.text()}`);
  });
  page.on('requestfailed', request => {
    failedRequests.push(`${request.url()}::${request.failure()?.errorText || 'failed'}`);
  });

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitFor(
      page,
      () => window.__CURVEBREAK_BOOTED__ === true && window.__CURVEBREAK_PATCHED__ === true,
      `${engine}: patched game did not boot`,
      20000,
    );

    const selfTests = await page.evaluate(() => window.__CURVEBREAK_SELFTEST__);
    assert(Array.isArray(selfTests) && selfTests.length >= 8, `${engine}: self-test suite missing`);
    assert(selfTests.every(test => test.pass), `${engine}: self-tests failed ${JSON.stringify(selfTests)}`);
    assert(await page.locator('#startBtn').isVisible(), `${engine}: start button hidden`);
    assert((await page.locator('#stageMap .stage-node').count()) === 6, `${engine}: campaign map does not have six nodes`);
    assert((await page.evaluate(() => window.__CURVEBREAK_TEST_HOOKS__.getStageCount())) === 6, `${engine}: stage contract is not six nodes`);

    const menuShot = path.join(EVIDENCE, `${engine}-${viewport.width}x${viewport.height}-menu.png`);
    await page.screenshot({ path: menuShot, fullPage: true });

    await activate(page, touch, '#startBtn');
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.state === 'play', `${engine}: match did not enter play`, 8000);

    const opening = await readDiagnostics(page);
    assert(opening.ball.flightTime > 0.75 && opening.ball.flightTime < 1.15, `${engine}: opening flight time unreadable (${opening.ball.flightTime})`);
    assert(opening.ball.speed > 30 && opening.ball.speed < 45, `${engine}: opening ball speed invalid (${opening.ball.speed})`);
    assert(opening.canvas.pixels <= 1665000, `${engine}: canvas pixel budget exceeded (${opening.canvas.pixels})`);

    const motionStart = await readDiagnostics(page);
    await page.waitForTimeout(320);
    const motionEnd = await readDiagnostics(page);
    assert(motionEnd.frame - motionStart.frame > 8, `${engine}: render loop stalled`);
    assert(Math.abs(motionEnd.ball.z - motionStart.ball.z) > 3.5, `${engine}: ball did not travel through depth`);

    await page.evaluate(() => {
      const game = window.__CURVEBREAK_GAME__;
      game.state = 'play';
      game.hitstop = 0;
      game.ball.heldBy = null;
      game.ball.x = 0; game.ball.y = 0; game.ball.z = 0;
      game.ball.vx = 0; game.ball.vy = 0; game.ball.vz = -35.2;
      game.ball.spinX = 8; game.ball.spinY = 0;
      game.ball.lastHitter = 'player';
      game.ball.trail.length = 0;
    });
    const curveStart = await readDiagnostics(page);
    await page.waitForTimeout(240);
    const curveEnd = await readDiagnostics(page);
    assert(Math.abs(curveEnd.ball.vx) > 1.1, `${engine}: spin did not accelerate lateral velocity`);
    assert(Math.abs(curveEnd.ball.x - curveStart.ball.x) > 0.08, `${engine}: spin did not bend the flight path`);

    const canvas = page.locator('#arena');
    const canvasBox = await canvas.boundingBox();
    assert(canvasBox, `${engine}: canvas bounds missing`);
    const playerBefore = await readDiagnostics(page);
    const targetX = canvasBox.x + canvasBox.width * 0.68;
    const targetY = canvasBox.y + canvasBox.height * 0.58;
    if (touch) await page.touchscreen.tap(targetX, targetY);
    else await page.mouse.click(targetX, targetY);
    await waitFor(
      page,
      () => {
        const player = window.__CURVEBREAK_DIAGNOSTICS__?.player;
        return player && Math.hypot(player.targetX, player.targetY) > 0.8;
      },
      `${engine}: released pointer did not set a persistent target`,
    );
    await page.waitForTimeout(230);
    const playerAfter = await readDiagnostics(page);
    assert(
      Math.hypot(playerAfter.player.x - playerBefore.player.x, playerAfter.player.y - playerBefore.player.y) > 0.45,
      `${engine}: paddle did not continue toward released target`,
    );

    const weaponBefore = playerAfter.player.weapon;
    await activate(page, touch, '#weaponBtn');
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.player.weapon !== 'blade', `${engine}: form button did not cycle weapon`);
    const weaponAfter = (await readDiagnostics(page)).player.weapon;
    assert(weaponAfter !== weaponBefore, `${engine}: form remained unchanged`);

    await page.evaluate(() => window.__CURVEBREAK_TEST_HOOKS__.setEnergy(100));
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.player.energy >= 99, `${engine}: energy state did not publish`);
    await activate(page, touch, '#dashBtn');
    await waitFor(
      page,
      () => {
        const player = window.__CURVEBREAK_DIAGNOSTICS__?.player;
        return player && player.energy < 80 && player.dashActive;
      },
      `${engine}: dash did not activate and consume energy`,
    );

    await page.evaluate(() => {
      const enemy = window.__CURVEBREAK_DIAGNOSTICS__.enemy;
      window.__CURVEBREAK_TEST_HOOKS__.approachEnemy(0.7, enemy.x, enemy.y);
    });
    await activate(page, touch, '#pauseBtn');
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.state === 'pause', `${engine}: pause failed`);
    const pausedAt = (await readDiagnostics(page)).combatTime;
    await page.waitForTimeout(360);
    const pausedAfter = (await readDiagnostics(page)).combatTime;
    assert(Math.abs(pausedAfter - pausedAt) < 0.015, `${engine}: combat clock advanced during pause (${pausedAt} -> ${pausedAfter})`);
    assert(await page.locator('#pausePanel').isVisible(), `${engine}: pause menu hidden`);
    await activate(page, touch, '#resumeBtn');
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.state === 'play', `${engine}: resume failed`);

    await page.evaluate(() => window.__CURVEBREAK_TEST_HOOKS__.setEnergy(100));
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.player.energy >= 99, `${engine}: shield energy did not publish`);
    await activate(page, touch, '#shieldBtn');
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.player.shield === 1, `${engine}: shield did not activate`);
    const coresBeforeShield = (await readDiagnostics(page)).player.cores;
    await stabilizePlayer(page);
    await page.evaluate(() => {
      const state = window.__CURVEBREAK_DIAGNOSTICS__;
      const missX = Math.min(7.7, state.player.x + 4.35);
      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.24, missX, state.player.y);
    });
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-shield-save', `${engine}: shield did not absorb a real miss`, 5000);
    const shieldResult = await readDiagnostics(page);
    assert(shieldResult.player.cores === coresBeforeShield, `${engine}: shield save removed a core`);
    assert(shieldResult.player.shield === 0, `${engine}: shield charge was not consumed`);

    await page.evaluate(() => window.__CURVEBREAK_TEST_HOOKS__.setWeapon(0));
    await stabilizePlayer(page);
    await page.evaluate(() => {
      const state = window.__CURVEBREAK_DIAGNOSTICS__;
      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.22, state.player.x + 2.45, state.player.y);
    });
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-hit', `${engine}: edge impact did not connect`, 5000);
    const edgeImpact = await readDiagnostics(page);
    assert(Math.abs(edgeImpact.ball.vx) > 4.8, `${engine}: impact region did not create a strong outgoing angle (${edgeImpact.ball.vx})`);

    await page.evaluate(() => window.__CURVEBREAK_TEST_HOOKS__.setWeapon(1));
    await stabilizePlayer(page);
    await page.evaluate(() => {
      const state = window.__CURVEBREAK_DIAGNOSTICS__;
      const tipY = Math.min(4.6, state.player.y + 2.1);
      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.22, state.player.x, tipY);
    });
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-spike-critical', `${engine}: Spike tip did not generate a critical return`, 5000);
    const spikeResult = await readDiagnostics(page);
    assert(Math.abs(spikeResult.ball.vz) > 40, `${engine}: Spike critical did not increase depth speed (${spikeResult.ball.vz})`);

    await page.evaluate(() => window.__CURVEBREAK_TEST_HOOKS__.setWeapon(0));
    await stabilizePlayer(page);
    await page.evaluate(() => {
      const state = window.__CURVEBREAK_DIAGNOSTICS__;
      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.3, state.player.x, state.player.y);
    });
    await parryAtImpact(page, touch);
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-perfect', `${engine}: real perfect parry did not trigger`, 5000);

    await page.evaluate(() => window.__CURVEBREAK_TEST_HOOKS__.setWeapon(2));
    await stabilizePlayer(page);
    await page.evaluate(() => {
      const state = window.__CURVEBREAK_DIAGNOSTICS__;
      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.3, state.player.x, state.player.y);
    });
    await parryAtImpact(page, touch);
    await waitFor(
      page,
      () => window.__CURVEBREAK_DIAGNOSTICS__?.ball.heldBy === 'player' && window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-catch',
      `${engine}: Orb did not capture a perfect parry`,
      5000,
    );
    await page.waitForTimeout(240);
    await activate(page, touch, '#parryBtn');
    await waitFor(
      page,
      () => window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-power-serve' && window.__CURVEBREAK_DIAGNOSTICS__?.ball.heldBy === null,
      `${engine}: Orb did not release a power serve`,
      5000,
    );

    const selectors = ['#pauseBtn', '#weaponBtn', '#shieldBtn', '#dashBtn', '#parryBtn'];
    const boxes = [];
    for (const selector of selectors) {
      const box = await page.locator(selector).boundingBox();
      assert(box, `${engine}: ${selector} missing`);
      assert(box.x >= -1 && box.y >= -1, `${engine}: ${selector} starts outside viewport`);
      assert(box.x + box.width <= viewport.width + 1, `${engine}: ${selector} exceeds viewport width`);
      assert(box.y + box.height <= viewport.height + 1, `${engine}: ${selector} exceeds viewport height`);
      boxes.push({ selector, box });
    }
    for (let i = 1; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        assert(overlapArea(boxes[i].box, boxes[j].box) <= 1, `${engine}: ${boxes[i].selector} overlaps ${boxes[j].selector}`);
      }
    }

    const finalState = await readDiagnostics(page);
    assert(finalState.frame - opening.frame > 40, `${engine}: render loop did not remain alive`);
    assert(finalState.errors.length === 0, `${engine}: diagnostic errors ${finalState.errors.join(' | ')}`);
    assert(browserErrors.length === 0, `${engine}: browser errors ${browserErrors.join(' | ')}`);
    assert(failedRequests.length === 0, `${engine}: failed requests ${failedRequests.join(' | ')}`);

    const gameplayShot = path.join(EVIDENCE, `${engine}-${viewport.width}x${viewport.height}-gameplay.png`);
    await page.screenshot({ path: gameplayShot, fullPage: true });
    results.push({
      engine,
      viewport,
      touch,
      passed: true,
      frame: finalState.frame,
      canvasPixels: finalState.canvas.pixels,
      openingFlightTime: opening.ball.flightTime,
      curvedDisplacement: Math.abs(curveEnd.ball.x - curveStart.ball.x),
      edgeVelocity: edgeImpact.ball.vx,
      spikeDepthSpeed: Math.abs(spikeResult.ball.vz),
      lastEvent: finalState.lastEvent,
      screenshots: [path.relative(ROOT, menuShot), path.relative(ROOT, gameplayShot)],
    });
  } catch (error) {
    const failure = path.join(EVIDENCE, `${engine}-${viewport.width}x${viewport.height}-failure.png`);
    await page.screenshot({ path: failure, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const serverLogPath = '/tmp/curvebreak-server.log';
  const serverLog = fs.openSync(serverLogPath, 'w');
  const server = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', serverLog, serverLog],
  });

  try {
    await sleep(1100);
    const chrome = await chromium.launch({
      headless: true,
      executablePath: process.env.SYSTEM_CHROME || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader'],
    });
    try {
      await runCase(chrome, 'chromium-desktop', { width: 1280, height: 800 }, false);
      await runCase(chrome, 'chromium-ipad', { width: 820, height: 1180 }, true);
      await runCase(chrome, 'chromium-phone', { width: 390, height: 844 }, true);
      await runCase(chrome, 'chromium-phone-landscape', { width: 844, height: 390 }, true);
    } finally {
      await chrome.close();
    }

    const safari = await webkit.launch({ headless: true });
    try {
      await runCase(safari, 'webkit-ipad', { width: 820, height: 1180 }, true);
      await runCase(safari, 'webkit-phone', { width: 390, height: 844 }, true);
    } finally {
      await safari.close();
    }

    fs.writeFileSync(path.join(EVIDENCE, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally {
    server.kill('SIGTERM');
    fs.closeSync(serverLog);
  }
})().catch(error => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'failure.txt'), String(error.stack || error));
  console.error(error.stack || error);
  process.exit(1);
});
