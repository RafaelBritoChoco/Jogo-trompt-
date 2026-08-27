const { chromium, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = 'http://127.0.0.1:8765/curvebreak/index.html';
const PLAYER_PLANE = 17.6 - 0.46;
const results = [];

function assert(value, message) {
  if (!value) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function diagnostics(page) {
  return page.evaluate(() => window.__CURVEBREAK_DIAGNOSTICS__ ?? null).catch(() => null);
}

async function waitFor(page, predicate, message, timeout = 10000, argument = null) {
  try {
    await page.waitForFunction(predicate, argument, { timeout });
  } catch (error) {
    const state = await diagnostics(page);
    throw new Error(`${message}; diagnostics=${JSON.stringify(state)}`);
  }
}

async function activate(page, touch, selector) {
  const locator = page.locator(selector);
  if (touch) await locator.tap({ timeout: 8000 });
  else await locator.click({ timeout: 8000 });
}

function overlaps(a, b, allowance = 0) {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapX > allowance && overlapY > allowance;
}

async function tapParryAtImpact(page, touch) {
  await waitFor(
    page,
    () => {
      const ball = window.__CURVEBREAK_DIAGNOSTICS__?.ball;
      if (!ball || ball.vz <= 0) return false;
      const time = (17.6 - 0.46 - ball.z) / ball.vz;
      return time > 0 && time < 0.082;
    },
    'ball never reached the real parry window',
    5000,
  );
  await activate(page, touch, '#parryBtn');
}

async function runCase(browser, name, viewport, touch) {
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
  page.on('requestfailed', request => failedRequests.push(`${request.url()}::${request.failure()?.errorText || 'failed'}`));

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitFor(page, () => window.__CURVEBREAK_BOOTED__ === true, `${name}: game did not boot`, 20000);

    const selfTests = await page.evaluate(() => window.__CURVEBREAK_SELFTEST__);
    assert(Array.isArray(selfTests), `${name}: self-tests missing`);
    assert(selfTests.length >= 8, `${name}: self-test coverage too small`);
    assert(selfTests.every(test => test.pass), `${name}: self-tests failed ${JSON.stringify(selfTests)}`);
    assert(await page.locator('#startBtn').isVisible(), `${name}: start button hidden`);
    assert(await page.locator('#stageMap .stage-node').count() === 6, `${name}: campaign map does not contain six nodes`);

    fs.mkdirSync(path.join(ROOT, 'curvebreak', 'evidence'), { recursive: true });
    const menuShot = path.join('curvebreak', 'evidence', `${name}-${viewport.width}x${viewport.height}-menu.png`);
    await page.screenshot({ path: path.join(ROOT, menuShot), fullPage: true });

    await activate(page, touch, '#startBtn');
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.state === 'play', `${name}: match did not enter play`, 8000);

    const startState = await diagnostics(page);
    assert(startState.ball.flightTime > 0.75 && startState.ball.flightTime < 1.15, `${name}: opening flight is unreadable (${startState.ball.flightTime})`);
    assert(startState.ball.speed > 30 && startState.ball.speed < 45, `${name}: opening ball speed out of range`);
    assert(startState.canvas.pixels <= 1665000, `${name}: internal canvas exceeds mobile pixel budget (${startState.canvas.pixels})`);

    const beforeMotion = await diagnostics(page);
    await page.waitForTimeout(320);
    const afterMotion = await diagnostics(page);
    assert(afterMotion.frame - beforeMotion.frame > 8, `${name}: render loop stalled`);
    assert(Math.abs(afterMotion.ball.z - beforeMotion.ball.z) > 3.5, `${name}: ball did not travel in depth`);

    const canvasBox = await page.locator('#arena').boundingBox();
    assert(canvasBox, `${name}: canvas bounds missing`);
    const targetX = canvasBox.x + canvasBox.width * 0.68;
    const targetY = canvasBox.y + canvasBox.height * 0.58;
    const playerBefore = await diagnostics(page);
    if (touch) await page.touchscreen.tap(targetX, targetY);
    else await page.mouse.click(targetX, targetY);
    await waitFor(
      page,
      () => {
        const player = window.__CURVEBREAK_DIAGNOSTICS__?.player;
        return player && Math.hypot(player.targetX, player.targetY) > 0.8;
      },
      `${name}: pointer did not set a persistent paddle target`,
    );
    await page.waitForTimeout(230);
    const playerAfter = await diagnostics(page);
    assert(
      Math.hypot(playerAfter.player.x - playerBefore.player.x, playerAfter.player.y - playerBefore.player.y) > 0.45,
      `${name}: paddle did not continue toward released pointer target`,
    );

    const weaponBefore = playerAfter.player.weapon;
    await activate(page, touch, '#weaponBtn');
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.player.weapon !== 'blade', `${name}: weapon did not cycle`);
    const weaponAfter = (await diagnostics(page)).player.weapon;
    assert(weaponAfter !== weaponBefore, `${name}: weapon remained unchanged`);

    await page.evaluate(() => window.__CURVEBREAK_TEST_HOOKS__.setEnergy(100));
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.player.energy >= 99, `${name}: energy hook did not publish`);
    await activate(page, touch, '#dashBtn');
    await waitFor(
      page,
      () => {
        const player = window.__CURVEBREAK_DIAGNOSTICS__?.player;
        return player && player.energy < 80 && player.dashActive;
      },
      `${name}: dash did not consume energy and activate`,
    );

    await activate(page, touch, '#pauseBtn');
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.state === 'pause', `${name}: pause failed`);
    const pausedAt = (await diagnostics(page)).combatTime;
    await page.waitForTimeout(360);
    const pausedAfter = (await diagnostics(page)).combatTime;
    assert(Math.abs(pausedAfter - pausedAt) < 0.015, `${name}: combat clock advanced during pause (${pausedAt} -> ${pausedAfter})`);
    assert(await page.locator('#pausePanel').isVisible(), `${name}: pause panel hidden`);
    await activate(page, touch, '#resumeBtn');
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.state === 'play', `${name}: resume failed`);

    await page.evaluate(() => window.__CURVEBREAK_TEST_HOOKS__.setEnergy(100));
    await waitFor(page, () => window.__CURVEBREAK_DIAGNOSTICS__?.player.energy >= 99, `${name}: shield energy did not publish`);
    await activate(page, touch, '#shieldBtn');
    await waitFor(
      page,
      () => window.__CURVEBREAK_DIAGNOSTICS__?.player.shield === 1,
      `${name}: shield did not activate`,
    );

    await page.evaluate(() => {
      window.__CURVEBREAK_TEST_HOOKS__.setWeapon(0);
      const player = window.__CURVEBREAK_DIAGNOSTICS__.player;
      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.3, player.x, player.y);
    });
    await tapParryAtImpact(page, touch);
    await waitFor(
      page,
      () => window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-perfect',
      `${name}: real perfect parry did not trigger`,
      5000,
    );

    await page.evaluate(() => {
      window.__CURVEBREAK_TEST_HOOKS__.setWeapon(2);
      const player = window.__CURVEBREAK_DIAGNOSTICS__.player;
      window.__CURVEBREAK_TEST_HOOKS__.approachPlayer(0.3, player.x, player.y);
    });
    await tapParryAtImpact(page, touch);
    await waitFor(
      page,
      () => window.__CURVEBREAK_DIAGNOSTICS__?.ball.heldBy === 'player' && window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-catch',
      `${name}: Orb did not capture the ball`,
      5000,
    );
    await page.waitForTimeout(240);
    await activate(page, touch, '#parryBtn');
    await waitFor(
      page,
      () => window.__CURVEBREAK_DIAGNOSTICS__?.lastEvent === 'player-power-serve' && window.__CURVEBREAK_DIAGNOSTICS__?.ball.heldBy === null,
      `${name}: Orb did not release a power serve`,
      5000,
    );

    const selectors = ['#pauseBtn', '#weaponBtn', '#shieldBtn', '#dashBtn', '#parryBtn'];
    const controls = [];
    for (const selector of selectors) {
      const box = await page.locator(selector).boundingBox();
      assert(box, `${name}: ${selector} missing`);
      assert(box.x >= -1 && box.y >= -1, `${name}: ${selector} starts outside viewport`);
      assert(box.x + box.width <= viewport.width + 1, `${name}: ${selector} exceeds viewport width`);
      assert(box.y + box.height <= viewport.height + 1, `${name}: ${selector} exceeds viewport height`);
      controls.push({ selector, box });
    }
    for (let i = 1; i < controls.length; i += 1) {
      for (let j = i + 1; j < controls.length; j += 1) {
        assert(!overlaps(controls[i].box, controls[j].box, 1), `${name}: ${controls[i].selector} overlaps ${controls[j].selector}`);
      }
    }

    const finalState = await diagnostics(page);
    assert(finalState.errors.length === 0, `${name}: diagnostic errors ${finalState.errors.join(' | ')}`);
    assert(browserErrors.length === 0, `${name}: browser errors ${browserErrors.join(' | ')}`);
    assert(failedRequests.length === 0, `${name}: failed requests ${failedRequests.join(' | ')}`);

    const gameplayShot = path.join('curvebreak', 'evidence', `${name}-${viewport.width}x${viewport.height}-gameplay.png`);
    await page.screenshot({ path: path.join(ROOT, gameplayShot), fullPage: true });
    results.push({
      name,
      viewport,
      touch,
      passed: true,
      frame: finalState.frame,
      flightTime: finalState.ball.flightTime,
      canvasPixels: finalState.canvas.pixels,
      lastEvent: finalState.lastEvent,
      screenshots: [menuShot, gameplayShot],
    });
  } catch (error) {
    const failurePath = path.join(ROOT, 'curvebreak', 'evidence', `${name}-${viewport.width}x${viewport.height}-failure.png`);
    await page.screenshot({ path: failurePath, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(path.join(ROOT, 'curvebreak', 'evidence'), { recursive: true });
  const serverLog = fs.openSync('/tmp/curvebreak-server.log', 'w');
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

    fs.writeFileSync(path.join(ROOT, 'curvebreak', 'evidence', 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally {
    server.kill('SIGTERM');
    fs.closeSync(serverLog);
  }
})().catch(error => {
  fs.mkdirSync(path.join(ROOT, 'curvebreak', 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'curvebreak', 'evidence', 'failure.txt'), String(error.stack || error));
  console.error(error.stack || error);
  process.exit(1);
});
