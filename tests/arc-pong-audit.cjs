const { chromium, webkit } = require('playwright');
const fs = require('fs');
const { spawn } = require('child_process');

const BASE = 'http://127.0.0.1:8765/index.html';
const PLAYER_HIT_PLANE_Z = 22.4 - 0.46;
const results = [];

function assert(value, message) {
  if (!value) throw new Error(message);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitState(page, predicate, message, timeout = 8000) {
  try {
    await page.waitForFunction(predicate, null, { timeout });
  } catch (error) {
    const diagnostics = await page
      .evaluate(() => window.__ARC_PONG_DIAGNOSTICS__ ?? null)
      .catch(() => null);
    throw new Error(`${message}; diagnostics=${JSON.stringify(diagnostics)}`);
  }
}

async function activate(page, touch, selector, key) {
  if (touch) await page.locator(selector).tap();
  else if (key) await page.keyboard.press(key);
  else await page.locator(selector).click();
}

async function parryAtRealImpact(page, touch) {
  await page.waitForFunction(
    plane => {
      const ball = window.__ARC_PONG_DIAGNOSTICS__?.ball;
      if (!ball || ball.vz <= 0) return false;
      const timeToImpact = (plane - ball.z) / ball.vz;
      return timeToImpact > 0 && timeToImpact < 0.095;
    },
    PLAYER_HIT_PLANE_Z,
    { timeout: 3000 },
  );

  if (touch) await page.locator('#parryBtn').tap();
  else await page.keyboard.down('Space');
}

async function runCase(browser, engine, viewport, touch) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: touch ? 2 : 1,
    hasTouch: touch,
    isMobile: touch,
    locale: 'pt-BR',
  });

  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];

  page.on('pageerror', error => errors.push(`page:${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console:${message.text()}`);
  });
  page.on('requestfailed', request => {
    failedRequests.push(`${request.url()}::${request.failure()?.errorText ?? 'failed'}`);
  });

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitState(
      page,
      () => window.__ARC_PONG_BOOTED__ === true,
      `${engine}: engine did not boot`,
      20000,
    );

    const selfTests = await page.evaluate(() => window.__ARC_PONG_SELFTEST__);
    assert(
      Array.isArray(selfTests) && selfTests.length === 7 && selfTests.every(test => test.pass),
      `${engine}: self-tests failed`,
    );
    assert(await page.locator('#startBtn').isVisible(), `${engine}: start button hidden`);
    assert(await page.locator('#pauseTop').isVisible(), `${engine}: pause control hidden`);
    assert(!(await page.locator('#fatal').isVisible()), `${engine}: fatal screen visible`);

    const menuShot = `evidence/${engine}-${viewport.width}x${viewport.height}-menu.png`;
    await page.screenshot({ path: menuShot, fullPage: true });

    if (touch) await page.locator('#startBtn').tap();
    else await page.locator('#startBtn').click();
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.state === 'play',
      `${engine}: match did not enter play`,
    );

    const beforeBall = await page.evaluate(() => ({ ...window.__ARC_PONG_DIAGNOSTICS__.ball }));
    await page.waitForTimeout(420);
    const afterBall = await page.evaluate(() => ({ ...window.__ARC_PONG_DIAGNOSTICS__.ball }));
    assert(Math.abs(afterBall.z - beforeBall.z) > 1, `${engine}: ball did not move in depth`);
    assert(afterBall.speed > 10, `${engine}: ball speed invalid`);

    const beforePlayer = await page.evaluate(() => ({ ...window.__ARC_PONG_DIAGNOSTICS__.player }));
    const canvasBox = await page.locator('#game').boundingBox();
    assert(canvasBox, `${engine}: canvas box missing`);
    const targetX = canvasBox.x + canvasBox.width * 0.68;
    const targetY = canvasBox.y + canvasBox.height * 0.66;
    if (touch) await page.touchscreen.tap(targetX, targetY);
    else await page.mouse.click(targetX, targetY);
    await waitState(
      page,
      () => {
        const player = window.__ARC_PONG_DIAGNOSTICS__?.player;
        return player && (Math.abs(player.x) > 1 || Math.abs(player.y) > 1);
      },
      `${engine}: pointer/touch did not move paddle`,
    );
    const afterPlayer = await page.evaluate(() => ({ ...window.__ARC_PONG_DIAGNOSTICS__.player }));
    assert(
      Math.hypot(afterPlayer.x - beforePlayer.x, afterPlayer.y - beforePlayer.y) > 1,
      `${engine}: paddle movement too small`,
    );

    const weaponBefore = afterPlayer.weapon;
    await activate(page, touch, '#weaponBtn', 'KeyQ');
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.player.weapon !== 'blade',
      `${engine}: weapon did not cycle`,
    );
    const weaponAfter = await page.evaluate(() => window.__ARC_PONG_DIAGNOSTICS__.player.weapon);
    assert(weaponAfter !== weaponBefore, `${engine}: weapon unchanged`);

    await page.evaluate(() => window.__ARC_PONG_TEST_HOOKS__.setEnergy(100));
    await activate(page, touch, '#dashBtn', 'ShiftLeft');
    await page.waitForTimeout(80);
    const dashEnergy = await page.evaluate(() => window.__ARC_PONG_DIAGNOSTICS__.player.energy);
    assert(dashEnergy < 76, `${engine}: dash did not consume energy`);

    await page.evaluate(() => window.__ARC_PONG_TEST_HOOKS__.setEnergy(100));
    await activate(page, touch, '#shieldBtn', 'KeyE');
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.player.shield === 1,
      `${engine}: shield did not activate`,
    );

    await page.evaluate(() => {
      window.__ARC_PONG_TEST_HOOKS__.setWeapon(0);
      window.__ARC_PONG_TEST_HOOKS__.approachPlayer(0, 0, 0.65);
    });
    await parryAtRealImpact(page, touch);
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.lastEvent === 'player-perfect',
      `${engine}: perfect parry did not trigger`,
      3000,
    );
    if (!touch) await page.keyboard.up('Space');

    await page.evaluate(() => {
      window.__ARC_PONG_TEST_HOOKS__.setWeapon(2);
      window.__ARC_PONG_TEST_HOOKS__.approachPlayer(0, 0, 0.65);
    });
    await parryAtRealImpact(page, touch);
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.lastEvent === 'player-catch',
      `${engine}: orb did not catch ball`,
      3000,
    );
    await page.waitForTimeout(380);
    if (touch) await page.locator('#parryBtn').tap();
    else await page.keyboard.up('Space');
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.lastEvent === 'player-power-serve',
      `${engine}: caught ball was not released`,
    );

    if (touch) await page.locator('#pauseTop').tap();
    else await page.keyboard.press('KeyP');
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.state === 'pause',
      `${engine}: pause failed`,
    );
    assert(await page.locator('#pauseMenu').isVisible(), `${engine}: pause menu hidden`);
    if (touch) await page.locator('#resumeBtn').tap();
    else await page.locator('#resumeBtn').click();
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.state === 'play',
      `${engine}: resume failed`,
    );

    if (touch) {
      const selectors = ['#parryBtn', '#dashBtn', '#shieldBtn', '#weaponBtn', '#pauseTop'];
      const buttons = await Promise.all(
        selectors.map(async selector => ({ selector, box: await page.locator(selector).boundingBox() })),
      );
      for (const entry of buttons) {
        assert(entry.box, `${engine}: ${entry.selector} missing`);
        assert(
          entry.box.x >= 0 &&
            entry.box.y >= 0 &&
            entry.box.x + entry.box.width <= viewport.width + 1 &&
            entry.box.y + entry.box.height <= viewport.height + 1,
          `${engine}: ${entry.selector} outside viewport`,
        );
      }
      for (let i = 0; i < 4; i += 1) {
        for (let j = i + 1; j < 4; j += 1) {
          const a = buttons[i].box;
          const b = buttons[j].box;
          const overlap = !(
            a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y
          );
          assert(!overlap, `${engine}: action buttons overlap`);
        }
      }
    }

    const diagnostics = await page.evaluate(() => window.__ARC_PONG_DIAGNOSTICS__);
    assert(diagnostics.frame > 120, `${engine}: too few frames advanced`);
    assert(
      diagnostics.errors.length === 0,
      `${engine}: diagnostic errors ${diagnostics.errors.join(' | ')}`,
    );
    assert(errors.length === 0, `${engine}: browser errors ${errors.join(' | ')}`);
    assert(
      failedRequests.length === 0,
      `${engine}: failed requests ${failedRequests.join(' | ')}`,
    );

    const gameplayShot = `evidence/${engine}-${viewport.width}x${viewport.height}-gameplay.png`;
    await page.screenshot({ path: gameplayShot, fullPage: true });
    results.push({
      engine,
      viewport,
      touch,
      passed: true,
      weaponAfter,
      frame: diagnostics.frame,
      lastEvent: diagnostics.lastEvent,
      screenshots: [menuShot, gameplayShot],
    });
  } catch (error) {
    await page
      .screenshot({
        path: `evidence/${engine}-${viewport.width}x${viewport.height}-failure.png`,
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync('evidence', { recursive: true });
  const server = spawn(
    'python3',
    ['-m', 'http.server', '8765', '--bind', '127.0.0.1'],
    {
      stdio: ['ignore', fs.openSync('/tmp/server.log', 'w'), fs.openSync('/tmp/server.log', 'a')],
    },
  );

  try {
    await sleep(1200);

    const chrome = await chromium.launch({
      headless: true,
      executablePath: process.env.SYSTEM_CHROME,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader'],
    });
    try {
      await runCase(chrome, 'chrome', { width: 1280, height: 800 }, false);
      await runCase(chrome, 'chrome-touch', { width: 820, height: 1180 }, true);
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

    fs.writeFileSync('evidence/results.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally {
    server.kill('SIGTERM');
  }
})().catch(error => {
  fs.mkdirSync('evidence', { recursive: true });
  fs.writeFileSync('evidence/failure.txt', String(error.stack || error));
  console.error(error.stack || error);
  process.exit(1);
});
