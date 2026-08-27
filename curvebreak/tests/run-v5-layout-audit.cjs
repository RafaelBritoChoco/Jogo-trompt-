const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sourcePath = path.join(__dirname, 'gameplay-audit-v4.cjs');
const generatedPath = path.join(__dirname, '.generated-v5-layout-audit.cjs');
let source = fs.readFileSync(sourcePath, 'utf8');

source = source.replace(
  "const BASE = 'http://127.0.0.1:8765/curvebreak/v2/index.html';",
  "const BASE = 'http://127.0.0.1:8765/curvebreak/v3/index.html';",
);
source = source.replace(
  "() => window.__CURVEBREAK_BOOTED__ === true && window.__CURVEBREAK_PATCHED__ === true,",
  "() => window.__CURVEBREAK_BOOTED__ === true && window.__CURVEBREAK_PATCHED__ === true && window.__CURVEBREAK_LAYOUT_V3__ === true,",
);

const layoutAnchor = "    for (let i = 1; i < boxes.length; i += 1) {";
const layoutChecks = `    const hudBox = await page.locator('#hud').boundingBox();
    const pauseBox = await page.locator('#pauseBtn').boundingBox();
    assert(hudBox && pauseBox, \`${'${engine}'}: HUD or pause bounds missing\`);
    assert(overlapArea(hudBox, pauseBox) <= 1, \`${'${engine}'}: pause button overlaps the rival HUD\`);

    const actionPanel = await page.locator('#mobileActions').boundingBox();
    assert(actionPanel, \`${'${engine}'}: action panel bounds missing\`);
    assert(actionPanel.x >= -1 && actionPanel.y >= -1, \`${'${engine}'}: action panel starts outside viewport\`);
    assert(actionPanel.x + actionPanel.width <= viewport.width + 1, \`${'${engine}'}: action panel exceeds viewport width\`);
    assert(actionPanel.y + actionPanel.height <= viewport.height + 1, \`${'${engine}'}: action panel exceeds viewport height\`);

${layoutAnchor}`;
source = source.replace(layoutAnchor, layoutChecks);

source = source.replaceAll('evidence-v4', 'evidence-v5');
fs.writeFileSync(generatedPath, source);

const result = spawnSync(process.execPath, [generatedPath], {
  cwd: path.resolve(__dirname, '..', '..'),
  env: process.env,
  stdio: 'inherit',
});
try { fs.unlinkSync(generatedPath); } catch (_) {}
process.exit(result.status == null ? 1 : result.status);
