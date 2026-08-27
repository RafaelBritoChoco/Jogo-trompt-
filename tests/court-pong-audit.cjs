const { chromium, webkit } = require('playwright');
const fs = require('fs');
const { spawn } = require('child_process');

const BASE = 'http://127.0.0.1:8787/index.html';
const RESULTS = [];
const PLAYER_HIT_PLANE_Z = 9.65 - 0.15;

function assert(value, message) {
  if (!value) throw new Error(message);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function diagnostics(page) {
  return page.evaluate(() => window.__COURT_PONG_DIAGNOSTICS__ ?? null).catch(() => null);
}

async function waitState(page, predicate, message, timeout = 9000, arg = null) {
  try {
    await page.waitForFunction(predicate, arg, { timeout });
  } catch (error) {
    throw new Error(`${message}; diagnostics=${JSON.stringify(await diagnostics(page))}`);
  }
}

async function action(page, touch, selector, key = null) {
  if (touch) await page.locator(selector).tap();
  else if (key) await page.keyboard.press(key);
  else await page.locator(selector).click();
}

async function parryDown(page, touch) {
  if (touch) {
    await page.locator('#parryBtn').dispatchEvent('pointerdown', {
      pointerId: 44,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
    });
  } else {
    await page.keyboard.down('Space');
  }
}

async function parryUp(page, touch) {
  if (touch) {
    await page.locator('#parryBtn').dispatchEvent('pointerup', {
      pointerId: 44,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
    });
  } else {
    await page.keyboard.up('Space');
  }
}

async function parryAtImpact(page, touch) {
  await waitState(
    page,
    () => {
      const d = window.__COURT_PONG_DIAGNOSTICS__;
      if (!d || d.ball.vz <= 0) return false;
      const t = (9.5 - d.ball.z) / d.ball.vz;
      return t > 0.018 && t < 0.075;
    },
    'ball did not enter the real perfect-parry window',
    3500,
  );
  await parryDown(page, touch);
}

function overlap(a, b, padding = 0) {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

async function movePlayerByPointer(page, touch) {
  const canvas = await page.locator('#game').boundingBox();
  assert(canvas, 'canvas has no bounding box');
  const before = await page.evaluate(() => ({
    player: { ...window.__COURT_PONG_DIAGNOSTICS__.player },
    marker: document.getElementById('player-marker').getBoundingClientRect().toJSON(),
  }));
  const x = canvas.x + canvas.width * 0.72;
  const y = canvas.y + canvas.height * 0.70;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await waitState(
    page,
    () => Math.abs(window.__COURT_PONG_DIAGNOSTICS__?.player.x ?? 0) > 1.1,
    'direct pointer/touch did not move the orange player piece',
    5000,
  );
  const after = await page.evaluate(() => ({
    player: { ...window.__COURT_PONG_DIAGNOSTICS__.player },
    marker: document.getElementById('player-marker').getBoundingClientRect().toJSON(),
  }));
  assert(Math.abs(after.player.x - before.player.x) > 1, 'player movement was too small');
  assert(Math.abs(after.marker.x - before.marker.x) > 8, 'VOCÊ marker did not follow the player piece');
}

async function assertLayout(page, viewport, engine) {
  const selectors = ['#parryBtn', '#dashBtn', '#shieldBtn', '#weaponBtn', '#pauseBtn'];
  const boxes = [];
  for (const selector of selectors) {
    const locator = page.locator(selector);
    assert(await locator.isVisible(), `${engine}: ${selector} is not visible`);
    const box = await locator.boundingBox();
    assert(box, `${engine}: ${selector} has no box`);
    assert(
      box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
      `${engine}: ${selector} lies outside viewport`,
    );
    boxes.push({ selector, box });
  }
  for (let i = 0; i < 4; i += 1) {
    for (let j = i + 1; j < 4; j += 1) {
      assert(!overlap(boxes[i].box, boxes[j].box), `${engine}: ${boxes[i].selector} overlaps ${boxes[j].selector}`);
    }
  }
  const topbar = await page.locator('#topbar').boundingBox();
  const actions = await page.locator('#actions').boundingBox();
  assert(topbar && actions, `${engine}: topbar/actions geometry missing`);
  assert(!overlap(topbar, actions), `${engine}: action bar overlaps match HUD`);
}

async function runCase(browser, engine, profile) {
  const { viewport, touch } = profile;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: touch ? 2 : 1,
    hasTouch: touch,
    isMobile: touch,
    locale: 'pt-BR',
    userAgent: touch
      ? 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
      : undefined,
  });
  const page = await context.newPage();
  const browserErrors = [];
  const failedRequests = [];
  page.on('pageerror', error => browserErrors.push(`page:${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`console:${message.text()}`);
  });
  page.on('requestfailed', request => failedRequests.push(`${request.url()}::${request.failure()?.errorText ?? 'failed'}`));

  const id = `${engine}-${viewport.width}x${viewport.height}`;
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitState(page, () => window.__COURT_PONG_BOOTED__ === true, `${id}: engine did not boot`, 30000);
    await page.waitForTimeout(500);

    const selfTests = await page.evaluate(() => window.__COURT_PONG_SELFTEST__);
    assert(Array.isArray(selfTests) && selfTests.length === 9, `${id}: unexpected self-test count`);
    assert(selfTests.every(test => test.pass), `${id}: self-tests failed: ${JSON.stringify(selfTests)}`);
    const documentTitle = await page.title();
    assert(documentTitle, `${id}: missing title`);
    assert(documentTitle === 'Court Pong — Arena 3D', `${id}: wrong title ${documentTitle}`);
    assert(!(await page.locator('#fatal').isVisible()), `${id}: fatal screen visible`);
    assert(await page.locator('#startBtn').isVisible(), `${id}: start button missing`);
    await assertLayout(page, viewport, id);

    const initial = await diagnostics(page);
    assert(initial.player.visible, `${id}: orange player piece is outside camera view`);
    assert(initial.player.z > 0 && initial.enemy.z < 0, `${id}: player/opponent zones are reversed`);
    assert(await page.locator('#player-marker').isVisible(), `${id}: VOCÊ marker is hidden`);
    await page.screenshot({ path: `evidence/${id}-menu.png`, fullPage: true });

    await action(page, touch, '#startBtn');
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__?.state === 'play', `${id}: match did not enter play`, 6000);
    const liveStart = await page.evaluate(() => ({
      frame: window.__COURT_PONG_DIAGNOSTICS__.frame,
      simTime: window.__COURT_PONG_DIAGNOSTICS__.simTime,
      ball: { ...window.__COURT_PONG_DIAGNOSTICS__.ball },
    }));
    await waitState(
      page,
      start => {
        const d = window.__COURT_PONG_DIAGNOSTICS__;
        return d && Math.hypot(d.ball.x - start.x, d.ball.z - start.z) > 1.2 && d.ball.speed > 8;
      },
      `${id}: ball did not travel through the court`,
      4000,
      liveStart.ball,
    );

    await movePlayerByPointer(page, touch);

    const weaponBefore = await page.evaluate(() => window.__COURT_PONG_DIAGNOSTICS__.player.weapon);
    await action(page, touch, '#weaponBtn', 'KeyQ');
    await waitState(page, before => window.__COURT_PONG_DIAGNOSTICS__?.player.weapon !== before, `${id}: form did not change`, 3000, weaponBefore);
    const weaponAfter = await page.evaluate(() => window.__COURT_PONG_DIAGNOSTICS__.player.weapon);
    assert(weaponAfter !== weaponBefore, `${id}: weapon stayed unchanged`);

    await page.evaluate(() => window.__COURT_PONG_TEST_HOOKS__.setEnergy(100));
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__.player.energy >= 99, `${id}: energy restore not published`);
    const dashBefore = await page.evaluate(() => window.__COURT_PONG_DIAGNOSTICS__.player.energy);
    await action(page, touch, '#dashBtn', 'ShiftLeft');
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__.player.energy < 80, `${id}: dash did not consume energy`);
    const dashAfter = await page.evaluate(() => window.__COURT_PONG_DIAGNOSTICS__.player.energy);
    assert(dashBefore - dashAfter > 20, `${id}: dash cost too small (${dashBefore} -> ${dashAfter})`);

    await page.evaluate(() => window.__COURT_PONG_TEST_HOOKS__.setEnergy(100));
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__.player.energy >= 99, `${id}: shield energy restore not published`);
    await action(page, touch, '#shieldBtn', 'KeyE');
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__.player.shield === 1, `${id}: shield did not activate`);

    await page.evaluate(() => {
      window.__COURT_PONG_TEST_HOOKS__.setWeapon(0);
      window.__COURT_PONG_TEST_HOOKS__.approachPlayer(0, 0, .68);
    });
    await parryAtImpact(page, touch);
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__?.lastEvent === 'player-perfect', `${id}: perfect parry did not trigger`, 3500);
    await parryUp(page, touch);

    await page.evaluate(() => {
      window.__COURT_PONG_TEST_HOOKS__.setWeapon(2);
      window.__COURT_PONG_TEST_HOOKS__.approachPlayer(0, 0, .68);
    });
    await parryAtImpact(page, touch);
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__?.lastEvent === 'player-catch', `${id}: ORB did not catch the ball`, 3500);
    await page.waitForTimeout(260);
    await parryUp(page, touch);
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__?.lastEvent === 'player-power-serve', `${id}: ORB did not release a charged serve`, 3000);

    await action(page, touch, '#pauseBtn', 'KeyP');
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__?.state === 'pause', `${id}: pause failed`);
    const paused = await diagnostics(page);
    await page.waitForTimeout(420);
    const pausedLater = await diagnostics(page);
    assert(Math.abs(pausedLater.simTime - paused.simTime) < 1e-6, `${id}: simulation advanced while paused`);
    await action(page, touch, '#startBtn');
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__?.state === 'play', `${id}: resume failed`);

    await page.evaluate(() => {
      const hooks = window.__COURT_PONG_TEST_HOOKS__;
      window.__COURT_PONG_GAME__.state = 'play';
      window.__COURT_PONG_GAME__.enemy.shieldCharges = 0;
      hooks.setLives(5, 1);
      hooks.score('player');
    });
    await waitState(page, () => window.__COURT_PONG_DIAGNOSTICS__?.state === 'levelwin', `${id}: level victory condition failed`);

    await page.evaluate(() => window.__COURT_PONG_TEST_HOOKS__.setLevel(1));
    const wind = await page.evaluate(() => ({
      level: window.__COURT_PONG_DIAGNOSTICS__.level,
      visible: window.__COURT_PONG_GAME__.windArrows.every(arrow => arrow.visible),
    }));
    assert(wind.level === 2 && wind.visible, `${id}: wind arena was not configured`);
    await page.evaluate(() => window.__COURT_PONG_TEST_HOOKS__.setLevel(2));
    const bumpers = await page.evaluate(() => window.__COURT_PONG_GAME__.bumpers.length);
    assert(bumpers === 2, `${id}: champion bumpers missing`);

    const final = await diagnostics(page);
    assert(final.frame - liveStart.frame > 30, `${id}: render loop stalled`);
    assert(final.errors.length === 0, `${id}: internal errors ${final.errors.join(' | ')}`);
    assert(browserErrors.length === 0, `${id}: browser errors ${browserErrors.join(' | ')}`);
    assert(failedRequests.length === 0, `${id}: failed requests ${failedRequests.join(' | ')}`);
    await page.screenshot({ path: `evidence/${id}-gameplay.png`, fullPage: true });

    RESULTS.push({
      id,
      engine,
      viewport,
      touch,
      passed: true,
      frame: final.frame,
      build: final.build,
      weaponAfter,
      screenshots: [`evidence/${id}-menu.png`, `evidence/${id}-gameplay.png`],
    });
  } catch (error) {
    await page.screenshot({ path: `evidence/${id}-failure.png`, fullPage: true }).catch(() => {});
    const snapshot = await diagnostics(page);
    fs.writeFileSync(`evidence/${id}-failure.json`, JSON.stringify({ error: String(error.stack || error), snapshot, browserErrors, failedRequests }, null, 2));
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync('evidence', { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', '8787', '--bind', '127.0.0.1'], {
    stdio: ['ignore', fs.openSync('/tmp/court-pong-server.log', 'w'), fs.openSync('/tmp/court-pong-server.log', 'a')],
  });
  try {
    await sleep(1200);
    const chrome = await chromium.launch({
      headless: true,
      executablePath: process.env.SYSTEM_CHROME,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
    });
    try {
      await runCase(chrome, 'chrome', { viewport: { width: 1280, height: 800 }, touch: false });
      await runCase(chrome, 'chrome-touch', { viewport: { width: 390, height: 844 }, touch: true });
    } finally {
      await chrome.close();
    }

    const wk = await webkit.launch({ headless: true });
    try {
      await runCase(wk, 'webkit-ipad-landscape', { viewport: { width: 1180, height: 820 }, touch: true });
      await runCase(wk, 'webkit-ipad', { viewport: { width: 820, height: 1180 }, touch: true });
      await runCase(wk, 'webkit-phone', { viewport: { width: 390, height: 844 }, touch: true });
    } finally {
      await wk.close();
    }

    fs.writeFileSync('evidence/results.json', JSON.stringify(RESULTS, null, 2));
    console.log(JSON.stringify(RESULTS, null, 2));
  } catch (error) {
    fs.writeFileSync('evidence/results.json', JSON.stringify({ results: RESULTS, failure: String(error.stack || error) }, null, 2));
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    server.kill('SIGTERM');
  }
})();
