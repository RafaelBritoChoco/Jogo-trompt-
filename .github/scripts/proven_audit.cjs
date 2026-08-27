const { chromium, webkit } = require('playwright');
const fs = require('fs');

const BASE = process.env.GAME_URL || 'http://127.0.0.1:8765/index.html';
const RESULTS_PATH = process.env.RESULTS_PATH || 'evidence/results.json';
const SHOT_PREFIX = process.env.SHOT_PREFIX || 'evidence';
const results = [];

function assert(value, message) {
  if (!value) throw new Error(message);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

async function waitForBridge(page, label) {
  await page.waitForFunction(
    () => document.documentElement.dataset.gameBridge === 'ready' && Boolean(window.__PROVEN_PONG__),
    null,
    { timeout: 30000 },
  ).catch(async error => {
    const body = await page.locator('body').innerText().catch(() => 'body unavailable');
    throw new Error(`${label}: game bridge did not boot; body=${body.slice(0, 500)}; ${error.message}`);
  });
}

async function realDrag(page, touch, box) {
  const x0 = box.x + box.width * 0.50;
  const y0 = box.y + box.height * 0.54;
  const x1 = box.x + box.width * 0.78;
  const y1 = box.y + box.height * 0.28;

  if (!touch) {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 22 });
    await page.mouse.up();
    return;
  }

  await page.evaluate(({ x0, y0, x1, y1 }) => {
    const target = document.body;
    const emit = (type, x, y) => {
      target.dispatchEvent(new PointerEvent(type, {
        pointerId: 17,
        pointerType: 'touch',
        isPrimary: true,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
        bubbles: true,
        cancelable: true,
        buttons: type === 'pointerup' ? 0 : 1,
      }));
    };
    emit('pointerdown', x0, y0);
    for (let i = 1; i <= 22; i += 1) {
      const t = i / 22;
      emit('pointermove', x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
    emit('pointerup', x1, y1);
  }, { x0, y0, x1, y1 });
}

async function markerInside(page, selector, viewport, label) {
  const locator = page.locator(selector);
  assert(await locator.isVisible(), `${label}: ${selector} is not visible`);
  const opacity = Number(await locator.evaluate(element => getComputedStyle(element).opacity));
  assert(opacity > 0.5, `${label}: ${selector} is transparent`);
  const box = await locator.boundingBox();
  assert(box, `${label}: ${selector} has no box`);
  assert(
    box.x + box.width > 0 &&
      box.y + box.height > 0 &&
      box.x < viewport.width &&
      box.y < viewport.height,
    `${label}: ${selector} is outside viewport: ${JSON.stringify(box)}`,
  );
}

async function runCase(browserType, engine, profile, launchOptions = {}) {
  const browser = await browserType.launch({ headless: true, ...launchOptions });
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.touch ? 2 : 1,
    hasTouch: profile.touch,
    isMobile: profile.touch,
    userAgent: profile.userAgent,
    locale: 'pt-BR',
  });
  const page = await context.newPage();
  const browserErrors = [];
  const failedRequests = [];
  const label = `${engine}/${profile.name}`;

  page.on('pageerror', error => browserErrors.push(`page:${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`console:${message.text()}`);
  });
  page.on('requestfailed', request => {
    failedRequests.push(`${request.url()}::${request.failure()?.errorText || 'failed'}`);
  });

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('#startButton').waitFor({ state: 'visible', timeout: 20000 });
    await page.screenshot({ path: `${SHOT_PREFIX}/${engine}-${profile.name}-menu.png`, fullPage: true });

    await page.locator('#startButton').click();
    await waitForBridge(page, label);
    await page.waitForTimeout(2600);

    const before = await page.evaluate(() => window.__PROVEN_PONG__.state());
    assert(Number.isFinite(before.ball.speed) && before.ball.speed > 0, `${label}: ball has no speed`);
    assert(before.player.z > before.rival.z, `${label}: player/rival depth ordering is invalid`);
    assert(before.paused === false, `${label}: game remained paused after one Play press`);

    const canvas = page.locator('#container canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 20000 });
    const canvasBox = await canvas.boundingBox();
    assert(canvasBox && canvasBox.width > 300 && canvasBox.height > 250, `${label}: invalid canvas`);

    await realDrag(page, profile.touch, canvasBox);
    await page.waitForTimeout(950);
    const moved = await page.evaluate(() => window.__PROVEN_PONG__.state());
    assert(
      distance(before.player, moved.player) > 4,
      `${label}: real ${profile.touch ? 'touch' : 'mouse'} input did not move paddle; ${JSON.stringify(before.player)} -> ${JSON.stringify(moved.player)}`,
    );

    await page.waitForTimeout(950);
    const after = await page.evaluate(() => window.__PROVEN_PONG__.state());
    assert(distance(moved.ball, after.ball) > 1, `${label}: ball froze during play`);

    await markerInside(page, '#playerMarker', profile.viewport, label);
    await markerInside(page, '#ballMarker', profile.viewport, label);
    await markerInside(page, '#rivalMarker', profile.viewport, label);
    await markerInside(page, '#controlHelp', profile.viewport, label);

    assert(browserErrors.length === 0, `${label}: browser errors: ${browserErrors.join(' | ')}`);
    assert(failedRequests.length === 0, `${label}: failed resources: ${failedRequests.join(' | ')}`);

    const screenshot = `${SHOT_PREFIX}/${engine}-${profile.name}-gameplay.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({
      engine,
      profile: profile.name,
      viewport: profile.viewport,
      touch: profile.touch,
      passed: true,
      before,
      after,
      screenshot,
    });
  } catch (error) {
    await page.screenshot({ path: `${SHOT_PREFIX}/${engine}-${profile.name}-failure.png`, fullPage: true }).catch(() => {});
    const state = await page.evaluate(() => window.__PROVEN_PONG__?.state?.() || null).catch(() => null);
    throw new Error(`${label}: ${error.message}; state=${JSON.stringify(state)}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  fs.mkdirSync(SHOT_PREFIX, { recursive: true });
  const desktop = { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false };
  const ipad = {
    name: 'ipad-landscape',
    viewport: { width: 1180, height: 820 },
    touch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  };
  const phone = {
    name: 'phone-landscape',
    viewport: { width: 844, height: 390 },
    touch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  };

  await runCase(chromium, 'chrome', desktop, {
    executablePath: process.env.SYSTEM_CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader'],
  });
  await runCase(webkit, 'webkit', ipad);
  await runCase(webkit, 'webkit', phone);

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(error => {
  fs.mkdirSync(SHOT_PREFIX, { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify({ results, failure: String(error.stack || error) }, null, 2));
  console.error(error.stack || error);
  process.exit(1);
});
