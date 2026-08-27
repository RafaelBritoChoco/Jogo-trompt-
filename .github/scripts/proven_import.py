from __future__ import annotations

from pathlib import Path

UPSTREAM_SHA = "6ba8949d289f6045d115e0e2e9eeabe7927b14ee"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Required anchor not found: {label}")
    return text.replace(old, new, 1)


html_path = Path("index.html")
html = html_path.read_text(encoding="utf-8")
html = replace_once(
    html,
    '<html lang="en">',
    '<html lang="pt-BR" data-build="proven-base-r2">',
    "html language/build marker",
)
html = replace_once(
    html,
    '<title>Path Traced Pong (a fully path traced game)</title>',
    '<title>PONG 3D — Sports Prototype</title>',
    "page title",
)
html = replace_once(
    html,
    '<meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><meta name="theme-color" content="#181c20"><link rel="icon" href="data:,">',
    "viewport",
)
html = replace_once(
    html,
    '<button id="startButton">Play</button>',
    '<button id="startButton"><span>JOGAR</span><small>Pong 3D sobre base aberta comprovada</small></button>',
    "play button",
)
html = replace_once(
    html,
    '<div id="info">Path Traced Pong (a fully path traced game)</div>',
    '<div id="info">PONG 3D · TESTE DE JOGABILIDADE</div>',
    "title HUD",
)
html = html.replace("color:rgb(26,179,255);", "color:#225f9b;")
html = html.replace("color:rgb(179,26,255);", "color:#a8422e;")
html = replace_once(
    html,
    '<script defer src="js/Path_Traced_Pong.js"> </script>',
    '''<script defer src="js/Path_Traced_Pong.js"> </script>

		<div id="objectMarkers" aria-hidden="true">
			<div id="playerMarker" class="marker player"><b>VOCÊ</b><span>SUA RAQUETE</span></div>
			<div id="ballMarker" class="marker ball"><i></i><b>BOLA</b></div>
			<div id="rivalMarker" class="marker rival"><b>RIVAL</b></div>
		</div>
		<div id="controlHelp">MOVA O MOUSE OU ARRASTE · DEVOLVA A BOLA BRANCA · PRIMEIRO A 5</div>''',
    "game script",
)
html = replace_once(
    html,
    "</head>",
    '''<style id="sports-readability">
		:root{--paper:#e9e0d1;--ink:#181c20;--blue:#225f9b;--rust:#a8422e;--white:#fffdf5;--line:rgba(24,28,32,.28)}
		*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
		html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;touch-action:none;overscroll-behavior:none}
		#container canvas{position:fixed!important;inset:0;width:100%!important;height:100%!important;display:block;touch-action:none}
		#overlay{position:fixed!important;inset:0!important;display:grid!important;place-items:center!important;background:linear-gradient(145deg,#eee5d7,#c7b7a1)!important;z-index:10000!important}
		#startButton{min-width:250px;padding:18px 28px;border:2px solid var(--ink);border-radius:7px;background:var(--paper);color:var(--ink);box-shadow:8px 8px 0 var(--ink);font:950 24px/1 system-ui;letter-spacing:.12em;cursor:pointer}
		#startButton small{display:block;margin-top:9px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;opacity:.64}
		#startButton:active{transform:translate(4px,4px);box-shadow:4px 4px 0 var(--ink)}
		#info{position:fixed!important;top:max(10px,env(safe-area-inset-top))!important;left:50%!important;transform:translateX(-50%);padding:8px 11px;background:rgba(233,224,209,.92);border:1px solid var(--ink);border-radius:3px;color:var(--ink)!important;font:900 9px/1 system-ui!important;letter-spacing:.15em!important;white-space:nowrap;z-index:30}
		#playerScore,#computerScore{bottom:max(10px,env(safe-area-inset-bottom))!important;padding:8px 11px;background:rgba(233,224,209,.94);border:1px solid currentColor;border-radius:3px;font:950 clamp(16px,3.2vw,27px)/1 system-ui!important;z-index:30}
		#cameraInfo{display:none!important}
		#infoBanner{top:13%!important;left:10%!important;right:10%!important;color:var(--paper)!important;font:950 clamp(23px,5vw,52px)/1 system-ui!important;text-shadow:0 2px 14px #000;z-index:30}
		#controlHelp{position:fixed;left:50%;bottom:max(58px,calc(env(safe-area-inset-bottom) + 58px));transform:translateX(-50%);max-width:calc(100vw - 24px);padding:7px 10px;background:rgba(24,28,32,.82);border:1px solid rgba(233,224,209,.25);border-radius:3px;color:var(--paper);font:850 9px/1.25 system-ui;letter-spacing:.09em;text-align:center;white-space:nowrap;z-index:28;pointer-events:none}
		.marker{position:fixed;left:0;top:0;transform:translate(-50%,-50%);display:flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid currentColor;border-radius:3px;background:rgba(233,224,209,.93);font:950 9px/1 system-ui;letter-spacing:.08em;z-index:26;pointer-events:none;will-change:left,top,opacity}
		.marker span{font-size:7px;opacity:.65}.marker.player{color:var(--blue)}.marker.rival{color:var(--rust)}.marker.ball{padding:4px 6px;color:var(--ink);background:rgba(255,253,245,.95)}
		.marker.ball i{width:10px;height:10px;border-radius:50%;background:var(--white);border:2px solid var(--ink);box-shadow:0 0 0 2px rgba(255,255,255,.55)}
		.lil-gui.root{opacity:.12;transition:opacity .15s}.lil-gui.root:hover{opacity:1}
		@media(max-width:700px){#controlHelp{font-size:7.5px;bottom:max(52px,calc(env(safe-area-inset-bottom) + 52px))}.marker{font-size:8px}.marker span{display:none}.lil-gui.root{display:none!important}}
		</style>
	</head>''',
    "head close",
)
html_path.write_text(html, encoding="utf-8")

game_path = Path("js/Path_Traced_Pong.js")
game = game_path.read_text(encoding="utf-8")
game = replace_once(game, "let gravityOn = true;", "let gravityOn = false;", "gravity default")
game = game.replace(
    'playerScoreElement.innerHTML = "Player: " + playerScore;',
    'playerScoreElement.innerHTML = "VOCÊ  " + playerScore;',
)
game = game.replace(
    'computerScoreElement.innerHTML = "Computer: " + computerScore;',
    'computerScoreElement.innerHTML = "RIVAL  " + computerScore;',
)
game = game.replace(
    'infoBannerElement.innerHTML = "Player WINS!"',
    'infoBannerElement.innerHTML = "VOCÊ VENCEU"',
)
game = game.replace(
    'infoBannerElement.innerHTML = "Computer WINS!"',
    'infoBannerElement.innerHTML = "RIVAL VENCEU"',
)
game = replace_once(
    game,
    "init(); // init app and start animating",
    "init(); // init app and start animating\n\tisPaused = false; // one explicit Play press starts control",
    "beginInit",
)
game = replace_once(
    game,
    "\t// DEBUG INFO\n\t//cameraInfoElement.innerHTML",
    "\twindow.__updateObjectMarkers?.();\n\n\t// DEBUG INFO\n\t//cameraInfoElement.innerHTML",
    "per-frame marker hook",
)
game += r'''

// Read-only audit bridge and labels projected from the real 3D positions.
(() => {
    const playerMarker = document.getElementById('playerMarker');
    const ballMarker = document.getElementById('ballMarker');
    const rivalMarker = document.getElementById('rivalMarker');
    const scratch = new THREE.Vector3();

    function place(marker, source, offsetY = 0) {
        if (!marker || !worldCamera) return;
        scratch.copy(source).project(worldCamera);
        const visible = Number.isFinite(scratch.x) && Number.isFinite(scratch.y) && scratch.z > -1.2 && scratch.z < 1.2;
        marker.style.opacity = visible ? '1' : '0';
        if (!visible) return;
        marker.style.left = `${(scratch.x * 0.5 + 0.5) * innerWidth}px`;
        marker.style.top = `${(-scratch.y * 0.5 + 0.5) * innerHeight + offsetY}px`;
    }

    window.__updateObjectMarkers = () => {
        place(playerMarker, playerPos, 36);
        place(ballMarker, ballPos, -22);
        place(rivalMarker, computerPos, -28);
    };

    window.__PROVEN_PONG__ = {
        state: () => ({
            player: { x: playerPos.x, y: playerPos.y, z: playerPos.z },
            rival: { x: computerPos.x, y: computerPos.y, z: computerPos.z },
            ball: { x: ballPos.x, y: ballPos.y, z: ballPos.z, speed: ballSpeed },
            score: { player: playerScore, rival: computerScore },
            difficulty,
            gravityOn,
            paused: isPaused,
            frameTime,
        }),
    };

    document.documentElement.dataset.gameBridge = 'ready';
})();
'''
game_path.write_text(game, encoding="utf-8")

shader_path = Path("shaders/Path_Traced_Pong_Fragment.glsl")
shader = shader_path.read_text(encoding="utf-8")
shader = replace_once(shader, "hitColor = vec3(1, 0, 0);", "hitColor = vec3(0.22, 0.24, 0.26);", "left wall")
shader = replace_once(shader, "hitColor = vec3(0, 0.7, 0);", "hitColor = vec3(0.38, 0.34, 0.29);", "right wall")
shader = replace_once(
    shader,
    "vec3(0.1, 0.7, 1.0), uCutSceneIsPlaying ? COAT : REFR",
    "vec3(0.08, 0.32, 0.62), COAT",
    "player material",
)
shader = replace_once(
    shader,
    "vec3(0.7, 0.1, 1.0), COAT",
    "vec3(0.68, 0.16, 0.07), COAT",
    "rival material",
)
shader_path.write_text(shader, encoding="utf-8")

Path("ATTRIBUTION.md").write_text(
    f"""# Attribution

This branch imports and modifies **PathTracedPong** by Erich Loftis, pinned to commit `{UPSTREAM_SHA}`.

The upstream project is released under CC0 1.0. The complete upstream license is preserved in `LICENSE-UPSTREAM-PathTracedPong`.

The R2 baseline retains the upstream renderer, path-traced room, ball motion, collision response, AI, mouse/touch control, camera, audio, modules and shaders. The rebuild layer changes material legibility, neutral sports presentation, Portuguese labels, one-press startup, projected object labels and a read-only audit bridge.
""",
    encoding="utf-8",
)

print("Proven-base R2 patch applied.")
