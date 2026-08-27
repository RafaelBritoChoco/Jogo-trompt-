(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
  const magnitude = (x, y) => Math.hypot(x, y);
  const TAU = Math.PI * 2;
  const FIXED_DT = 1 / 120;
  const ARENA = Object.freeze({ x: 8.8, y: 5.35, playerZ: 17.6, enemyZ: -17.6, goalZ: 19.1 });
  const BALL_RADIUS = 0.46;
  const MAX_CANVAS_PIXELS = 1_650_000;

  const WEAPONS = Object.freeze([
    {
      id: 'blade', name: 'BLADE', glyph: '▭', color: '#55f6ff', width: 6.2, height: 3.8,
      radius: 0, moveSpeed: 20.5, hitGain: 1.035, spinGain: 1,
      description: 'Forma estável: maior cobertura e controle limpo de ângulo.',
    },
    {
      id: 'spike', name: 'SPIKE', glyph: '△', color: '#ffe06a', width: 5.6, height: 4.9,
      radius: 0, moveSpeed: 19.2, hitGain: 1.055, spinGain: 1.08,
      description: 'Forma de risco: a ponta converte precisão em velocidade crítica.',
    },
    {
      id: 'orb', name: 'ORB', glyph: '○', color: '#ff4dd8', width: 0, height: 0,
      radius: 2.65, moveSpeed: 23.2, hitGain: 1.025, spinGain: 1.22,
      description: 'Forma veloz: parry perfeito captura a esfera para um saque carregado.',
    },
  ]);

  const AI_PRESETS = Object.freeze([
    { label: 'ROOKIE', reaction: 0.19, error: 1.18, speed: 16.6, parry: 0.12, ability: 0.05 },
    { label: 'RIVAL', reaction: 0.105, error: 0.52, speed: 20.4, parry: 0.38, ability: 0.24 },
    { label: 'APEX', reaction: 0.058, error: 0.17, speed: 23.8, parry: 0.68, ability: 0.48 },
  ]);

  const STAGES = Object.freeze([
    {
      name: 'Dock Zero', short: 'DOCK', story: 'O antigo porto orbital foi convertido na primeira arena da Liga. Aqui, nenhum campo externo mascara um contato ruim.',
      threat: 'RIVAL: SENTINELA', modifier: 'ARENA LIMPA', ai: 0, enemyWeapon: 0, playerCores: 5, enemyCores: 4,
      startDepth: 35.2, maxDepth: 49, gate: false, wind: 0, pulse: 0, theme: ['#55f6ff', '#16476f', '#031126'],
    },
    {
      name: 'Glass Circuit', short: 'GLASS', story: 'Os corredores transparentes carregam uma corrente lateral lenta. Ler a curva cedo vale mais do que reagir tarde.',
      threat: 'RIVAL: VETOR', modifier: 'CORRENTE LATERAL', ai: 1, enemyWeapon: 0, playerCores: 5, enemyCores: 5,
      startDepth: 36.2, maxDepth: 50, gate: false, wind: 1.25, pulse: 0, theme: ['#70ffb1', '#14574f', '#031a1c'],
    },
    {
      name: 'Mirror Rift', short: 'MIRROR', story: 'Uma fenda central reorienta a velocidade da esfera. O portal é um atalho para quem controla spin e uma armadilha para quem apenas bloqueia.',
      threat: 'RIVAL: REFRAÇÃO', modifier: 'RIFT GATE', ai: 1, enemyWeapon: 1, playerCores: 5, enemyCores: 5,
      startDepth: 36.8, maxDepth: 51, gate: true, gateMove: 0.55, wind: 0, pulse: 0, theme: ['#b37cff', '#443174', '#100728'],
    },
    {
      name: 'Storm Foundry', short: 'STORM', story: 'Bobinas industriais pulsam em lados alternados. O melhor ataque nasce quando a corrente já está empurrando a bola.',
      threat: 'RIVAL: FORJADOR', modifier: 'PULSOS DE CAMPO', ai: 1, enemyWeapon: 2, playerCores: 5, enemyCores: 5,
      startDepth: 37.4, maxDepth: 52, gate: false, wind: 0.7, pulse: 2.1, theme: ['#ffe06a', '#704c19', '#211003'],
    },
    {
      name: 'Black Relay', short: 'RELAY', story: 'O relé militar libera dash, escudo e troca de forma para os dois lados. A luta deixa de ser reação e vira leitura do adversário.',
      threat: 'RIVAL: EXECUTOR', modifier: 'ARSENAL ESPELHADO', ai: 2, enemyWeapon: 1, playerCores: 5, enemyCores: 6,
      startDepth: 38.2, maxDepth: 53, gate: true, gateMove: 0.9, wind: 0.8, pulse: 1.1, enemyAbilities: true, theme: ['#ff5d7d', '#67213a', '#21050d'],
    },
    {
      name: 'The Curator', short: 'CURATOR', story: 'A entidade que arquivou milhares de duelos prevê trajetórias comuns. Para quebrar o arquivo, é preciso mudar a decisão durante o voo.',
      threat: 'BOSS: CURATOR', modifier: 'RIFT DUPLO', ai: 2, enemyWeapon: 2, playerCores: 6, enemyCores: 7,
      startDepth: 39, maxDepth: 55, gate: true, gateMove: 1.35, secondGate: true, wind: 1.05, pulse: 1.6, enemyAbilities: true, boss: true,
      theme: ['#ff4dd8', '#4d175a', '#16051d'],
    },
  ]);

  const safeStorage = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : JSON.parse(value);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    },
  };

  function shapeContains(weaponId, dx, dy) {
    const weapon = WEAPONS.find(item => item.id === weaponId) || WEAPONS[0];
    if (weapon.id === 'orb') return dx * dx + dy * dy <= weapon.radius * weapon.radius;
    if (weapon.id === 'blade') return Math.abs(dx) <= weapon.width / 2 && Math.abs(dy) <= weapon.height / 2;
    const normalizedY = (dy + weapon.height / 2) / weapon.height;
    if (normalizedY < 0 || normalizedY > 1) return false;
    const halfWidth = (1 - normalizedY) * weapon.width / 2 + 0.16;
    return Math.abs(dx) <= halfWidth;
  }

  function isSpikeTip(dx, dy) {
    const weapon = WEAPONS[1];
    const normalizedY = (dy + weapon.height / 2) / weapon.height;
    return normalizedY > 0.67 && Math.abs(dx) < weapon.width * 0.13;
  }

  class SeededRandom {
    constructor(seed = 0x4f1bbcdc) { this.state = seed >>> 0; }
    next() {
      let x = this.state;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.state = x >>> 0;
      return this.state / 4294967296;
    }
    range(min, max) { return min + (max - min) * this.next(); }
    sign() { return this.next() < 0.5 ? -1 : 1; }
  }

  class SynthAudio {
    constructor(random) { this.random = random; this.context = null; this.master = null; }
    unlock() {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!this.context) {
        this.context = new AudioContextCtor();
        this.master = this.context.createGain();
        this.master.gain.value = 0.24;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    }
    tone(frequency, duration = 0.1, type = 'sine', volume = 0.2, slide = 1) {
      if (!this.context || this.context.state !== 'running') return;
      const now = this.context.currentTime;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = type;
      const jitter = this.random.range(0.985, 1.015);
      osc.frequency.setValueAtTime(Math.max(24, frequency * jitter), now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, frequency * slide), now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.025);
    }
    hit(perfect, critical) {
      this.tone(critical ? 490 : perfect ? 410 : 275, critical ? 0.18 : 0.11, critical ? 'sawtooth' : 'triangle', critical ? 0.32 : 0.22, critical ? 2.05 : 1.35);
      if (perfect || critical) this.tone(critical ? 1180 : 830, 0.12, 'sine', 0.16, 0.74);
    }
    wall() { this.tone(145, 0.045, 'square', 0.08, 0.72); }
    point(won) { this.tone(won ? 310 : 105, 0.34, won ? 'triangle' : 'sawtooth', 0.28, won ? 2.25 : 0.5); }
    ability(kind) {
      if (kind === 'dash') this.tone(170, 0.13, 'sawtooth', 0.18, 2.8);
      if (kind === 'shield') this.tone(480, 0.18, 'sine', 0.2, 0.68);
      if (kind === 'weapon') this.tone(230, 0.095, 'square', 0.12, 1.65);
      if (kind === 'catch') { this.tone(350, 0.16, 'sine', 0.18, 0.55); this.tone(700, 0.19, 'triangle', 0.1, 1.25); }
      if (kind === 'serve') this.tone(220, 0.22, 'sawtooth', 0.24, 3.1);
      if (kind === 'gate') this.tone(560, 0.18, 'sine', 0.2, 1.8);
    }
  }

  class ParticleField {
    constructor(random) { this.random = random; this.items = []; }
    burst(x, y, z, color, amount = 18, strength = 1) {
      for (let index = 0; index < amount; index += 1) {
        const angle = this.random.range(0, TAU);
        const elevation = this.random.range(-1, 1);
        const radius = Math.sqrt(Math.max(0, 1 - elevation * elevation));
        const speed = this.random.range(2.4, 7.2) * strength;
        this.items.push({
          x, y, z,
          vx: Math.cos(angle) * radius * speed,
          vy: Math.sin(angle) * radius * speed,
          vz: elevation * speed,
          life: this.random.range(0.22, 0.52),
          maxLife: this.random.range(0.22, 0.52),
          color,
          size: this.random.range(0.06, 0.18),
        });
      }
      if (this.items.length > 220) this.items.splice(0, this.items.length - 220);
    }
    update(dt) {
      for (let index = this.items.length - 1; index >= 0; index -= 1) {
        const item = this.items[index];
        item.life -= dt;
        if (item.life <= 0) { this.items.splice(index, 1); continue; }
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        item.z += item.vz * dt;
        const drag = Math.exp(-4.3 * dt);
        item.vx *= drag; item.vy *= drag; item.vz *= drag;
      }
    }
  }

  class Paddle {
    constructor(game, side) {
      this.game = game;
      this.side = side;
      this.weaponIndex = 0;
      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;
      this.targetX = 0; this.targetY = 0;
      this.energy = 72;
      this.cores = 5;
      this.maxCores = 5;
      this.dashUntil = 0;
      this.dashCooldownUntil = 0;
      this.shieldUntil = 0;
      this.shieldCharges = 0;
      this.parryUntil = 0;
      this.perfectUntil = 0;
      this.catchGraceUntil = 0;
      this.parryHeld = false;
      this.aiThink = 0;
      this.aiAbilityThink = 0;
    }
    get weapon() { return WEAPONS[this.weaponIndex]; }
    get z() { return this.side === 'player' ? ARENA.playerZ : ARENA.enemyZ; }
    reset(cores, weaponIndex = 0) {
      this.weaponIndex = weaponIndex;
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.targetX = 0; this.targetY = 0;
      this.energy = 72;
      this.maxCores = cores; this.cores = cores;
      this.dashUntil = 0; this.dashCooldownUntil = 0;
      this.shieldUntil = 0; this.shieldCharges = 0;
      this.parryUntil = 0; this.perfectUntil = 0; this.catchGraceUntil = 0;
      this.parryHeld = false; this.aiThink = 0; this.aiAbilityThink = 0;
    }
    setWeapon(index, announce = false) {
      this.weaponIndex = (index + WEAPONS.length) % WEAPONS.length;
      this.clampTarget();
      if (announce && this.side === 'player') {
        this.game.audio.ability('weapon');
        this.game.callout(this.weapon.name, 'FORMA ATIVA', this.weapon.color, 0.52);
      }
    }
    cycleWeapon(announce = true) { this.setWeapon(this.weaponIndex + 1, announce); }
    clampTarget() {
      const marginX = this.weapon.id === 'orb' ? this.weapon.radius * 0.7 : this.weapon.width * 0.31;
      const marginY = this.weapon.id === 'orb' ? this.weapon.radius * 0.7 : this.weapon.height * 0.31;
      const radiusX = Math.max(1, ARENA.x - marginX);
      const radiusY = Math.max(1, ARENA.y - marginY);
      const ellipse = this.targetX * this.targetX / (radiusX * radiusX) + this.targetY * this.targetY / (radiusY * radiusY);
      if (ellipse > 1) {
        const scale = 1 / Math.sqrt(ellipse);
        this.targetX *= scale; this.targetY *= scale;
      }
    }
    update(dt, combatTime) {
      this.energy = clamp(this.energy + 7.2 * dt, 0, 100);
      this.clampTarget();
      const dash = combatTime < this.dashUntil;
      const stiffness = dash ? 86 : 57;
      const damping = dash ? 11 : 12.5;
      this.vx += (this.targetX - this.x) * stiffness * dt;
      this.vy += (this.targetY - this.y) * stiffness * dt;
      const drag = Math.exp(-damping * dt);
      this.vx *= drag; this.vy *= drag;
      const maxSpeed = this.weapon.moveSpeed * (dash ? 1.82 : 1);
      const speed = magnitude(this.vx, this.vy);
      if (speed > maxSpeed) { this.vx *= maxSpeed / speed; this.vy *= maxSpeed / speed; }
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.x = clamp(this.x, -ARENA.x + 0.4, ARENA.x - 0.4);
      this.y = clamp(this.y, -ARENA.y + 0.35, ARENA.y - 0.35);
      if (combatTime >= this.shieldUntil) this.shieldCharges = 0;
    }
    contains(x, y) { return shapeContains(this.weapon.id, x - this.x, y - this.y); }
    pressParry(combatTime) {
      if (this.game.ball.heldBy === this.side) {
        this.game.releaseCaughtBall(this);
        return;
      }
      this.parryHeld = true;
      this.parryUntil = combatTime + 0.235;
      this.perfectUntil = combatTime + 0.105;
      this.catchGraceUntil = combatTime + 0.18;
      if (this.side === 'player') this.game.setStatus('JANELA DE PARRY ABERTA');
    }
    releaseParry() { this.parryHeld = false; }
    dash(combatTime) {
      if (this.energy < 26 || combatTime < this.dashCooldownUntil) return false;
      this.energy -= 26;
      this.dashUntil = combatTime + 0.29;
      this.dashCooldownUntil = combatTime + 0.55;
      const dx = this.targetX - this.x, dy = this.targetY - this.y;
      const distance = magnitude(dx, dy);
      if (distance > 0.01) { this.vx += dx / distance * 8.2; this.vy += dy / distance * 8.2; }
      if (this.side === 'player') {
        this.game.audio.ability('dash'); this.game.addTrauma(0.14); this.game.punchFov(5.5);
        this.game.callout('DASH', 'IMPULSO VETORIAL', '#ffe06a', 0.38);
      }
      return true;
    }
    shield(combatTime) {
      if (this.energy < 38 || this.shieldCharges > 0) return false;
      this.energy -= 38;
      this.shieldCharges = 1;
      this.shieldUntil = combatTime + 5;
      if (this.side === 'player') {
        this.game.audio.ability('shield'); this.game.callout('SHIELD', 'UM ERRO SERÁ BLOQUEADO', '#70ffb1', 0.54);
      }
      return true;
    }
  }

  class Ball {
    constructor(game) {
      this.game = game;
      this.x = 0; this.y = 0; this.z = 0;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.spinX = 0; this.spinY = 0;
      this.heldBy = null;
      this.holdStarted = 0;
      this.lastHitter = 'player';
      this.gateCooldownUntil = 0;
      this.trail = [];
    }
    reset() {
      this.x = 0; this.y = 0; this.z = 0;
      this.vx = 0; this.vy = 0; this.vz = 0;
      this.spinX = 0; this.spinY = 0;
      this.heldBy = null; this.holdStarted = 0;
      this.gateCooldownUntil = 0; this.trail.length = 0;
    }
    launch(direction = -1) {
      const stage = this.game.stage;
      this.heldBy = null;
      this.x = this.game.random.range(-0.6, 0.6);
      this.y = this.game.random.range(-0.45, 0.45);
      this.z = 0;
      this.vz = Math.abs(stage.startDepth) * direction;
      this.vx = this.game.random.range(-2.8, 2.8);
      this.vy = this.game.random.range(-2.1, 2.1);
      this.spinX = this.game.random.range(-0.5, 0.5);
      this.spinY = this.game.random.range(-0.4, 0.4);
      this.lastHitter = direction < 0 ? 'player' : 'enemy';
      this.trail.length = 0;
    }
    speed() { return Math.hypot(this.vx, this.vy, this.vz); }
    depthFlightTime() { return (ARENA.playerZ - ARENA.enemyZ) / Math.max(0.001, Math.abs(this.vz)); }
    update(dt) {
      if (this.heldBy) {
        const paddle = this.heldBy === 'player' ? this.game.player : this.game.enemy;
        this.x = paddle.x; this.y = paddle.y; this.z = paddle.z + (this.heldBy === 'player' ? -0.72 : 0.72);
        this.vx = paddle.vx * 0.2; this.vy = paddle.vy * 0.2; this.vz = 0;
        this.pushTrail();
        return;
      }

      const previous = { x: this.x, y: this.y, z: this.z };
      const depthFactor = clamp(Math.abs(this.vz) / 38, 0.65, 1.5);
      this.vx += this.spinX * depthFactor * dt;
      this.vy += this.spinY * depthFactor * dt;
      const spinDecay = Math.exp(-0.48 * dt);
      this.spinX *= spinDecay; this.spinY *= spinDecay;

      this.game.applyArenaForces(this, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;

      const xLimit = ARENA.x - BALL_RADIUS;
      const yLimit = ARENA.y - BALL_RADIUS;
      if (this.x < -xLimit || this.x > xLimit) {
        this.x = clamp(this.x, -xLimit, xLimit);
        this.vx *= -0.96;
        this.spinX *= -0.55;
        this.game.wallImpact(this.x, this.y, this.z);
      }
      if (this.y < -yLimit || this.y > yLimit) {
        this.y = clamp(this.y, -yLimit, yLimit);
        this.vy *= -0.96;
        this.spinY *= -0.55;
        this.game.wallImpact(this.x, this.y, this.z);
      }

      this.game.checkGateCrossing(this, previous.z);

      if (this.vz > 0 && previous.z < ARENA.playerZ - BALL_RADIUS && this.z >= ARENA.playerZ - BALL_RADIUS) {
        this.resolvePlane('player', previous);
      } else if (this.vz < 0 && previous.z > ARENA.enemyZ + BALL_RADIUS && this.z <= ARENA.enemyZ + BALL_RADIUS) {
        this.resolvePlane('enemy', previous);
      }
      this.pushTrail();
    }
    pushTrail() {
      this.trail.push({ x: this.x, y: this.y, z: this.z });
      if (this.trail.length > 28) this.trail.shift();
    }
    resolvePlane(side, previous) {
      const paddle = side === 'player' ? this.game.player : this.game.enemy;
      const plane = side === 'player' ? ARENA.playerZ - BALL_RADIUS : ARENA.enemyZ + BALL_RADIUS;
      const denominator = this.z - previous.z;
      const t = Math.abs(denominator) < 1e-8 ? 1 : clamp((plane - previous.z) / denominator, 0, 1);
      const hitX = lerp(previous.x, this.x, t);
      const hitY = lerp(previous.y, this.y, t);
      this.x = hitX; this.y = hitY; this.z = plane;

      const inside = paddle.contains(hitX, hitY);
      const activeParry = this.game.combatTime <= paddle.parryUntil;
      const perfect = activeParry && this.game.combatTime <= paddle.perfectUntil;
      const catchEligible = perfect && paddle.weapon.id === 'orb' && (paddle.parryHeld || this.game.combatTime <= paddle.catchGraceUntil);

      if (inside && catchEligible) {
        this.game.catchBall(paddle);
        return;
      }
      if (inside) {
        this.game.reflectBall(this, paddle, hitX, hitY, perfect);
        return;
      }
      if (paddle.shieldCharges > 0 && this.game.combatTime < paddle.shieldUntil) {
        paddle.shieldCharges -= 1;
        this.game.shieldSave(this, paddle, hitX, hitY);
        return;
      }
      this.game.loseCore(side);
    }
  }

  class ArenaRenderer {
    constructor(canvas, context, game) {
      this.canvas = canvas; this.context = context; this.game = game;
      this.width = 1; this.height = 1; this.dpr = 1;
      this.cameraX = 0; this.cameraY = 0; this.cameraZ = 28.3;
      this.centerX = 0; this.centerY = 0; this.focal = 600;
      this.stars = Array.from({ length: 90 }, (_, index) => ({
        x: ((index * 97) % 1000) / 1000,
        y: ((index * 53 + 17) % 1000) / 1000,
        size: index % 11 === 0 ? 1.5 : 0.7,
        alpha: 0.12 + (index % 7) * 0.055,
      }));
      this.resize();
    }
    resize() {
      this.width = Math.max(1, window.innerWidth);
      this.height = Math.max(1, window.innerHeight);
      const nativeDpr = window.devicePixelRatio || 1;
      const pixelCapDpr = Math.sqrt(MAX_CANVAS_PIXELS / (this.width * this.height));
      this.dpr = clamp(Math.min(nativeDpr, pixelCapDpr), 0.75, 1.75);
      const pixelWidth = Math.max(1, Math.round(this.width * this.dpr));
      const pixelHeight = Math.max(1, Math.round(this.height * this.dpr));
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth; this.canvas.height = pixelHeight;
      }
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    configureCamera() {
      const game = this.game;
      const portrait = this.height > this.width * 1.15;
      this.centerX = this.width * 0.5 + game.shakeX;
      this.centerY = this.height * (portrait ? 0.485 : 0.51) + game.shakeY;
      this.cameraX = game.player.x * 0.055;
      this.cameraY = game.player.y * 0.045;
      const baseFocal = Math.min(this.width * (portrait ? 1.02 : 0.78), this.height * (portrait ? 0.82 : 1.08));
      this.focal = baseFocal / (1 + game.fovPunch * 0.026);
    }
    project(x, y, z) {
      const depth = this.cameraZ - z;
      if (depth <= 0.7) return { x: this.centerX, y: this.centerY, scale: 0, visible: false, depth };
      const scale = this.focal / depth;
      return {
        x: this.centerX + (x - this.cameraX) * scale,
        y: this.centerY - (y - this.cameraY) * scale,
        scale,
        visible: true,
        depth,
      };
    }
    line(points, stroke, width = 1, alpha = 1) {
      const ctx = this.context;
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = stroke; ctx.lineWidth = width;
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.stroke(); ctx.restore();
    }
    polygon(points, fill, stroke, width = 1, alpha = 1) {
      const ctx = this.context;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
      ctx.restore();
    }
    render() {
      this.resize(); this.configureCamera();
      const ctx = this.context, game = this.game, stage = game.stage;
      const [accent, mid, dark] = stage.theme;
      const gradient = ctx.createRadialGradient(this.width * 0.5, this.height * 0.42, 10, this.width * 0.5, this.height * 0.48, Math.max(this.width, this.height) * 0.75);
      gradient.addColorStop(0, mid);
      gradient.addColorStop(0.44, dark);
      gradient.addColorStop(1, '#01030a');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.width, this.height);

      for (const star of this.stars) {
        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = star.size > 1 ? accent : '#8ca6c2';
        ctx.fillRect(star.x * this.width, star.y * this.height * 0.78, star.size, star.size);
      }
      ctx.globalAlpha = 1;
      this.drawArena(accent, mid);
      this.drawModifiers(accent);
      this.drawPaddle(game.enemy, false);
      this.drawTrail();
      this.drawParticles();
      this.drawBall();
      this.drawPaddle(game.player, true);
      this.drawTargetReticle();
      this.drawVignette();
    }
    drawArena(accent, mid) {
      const nearZ = ARENA.playerZ + 0.15, farZ = ARENA.enemyZ - 0.15;
      const corners = z => [
        this.project(-ARENA.x, -ARENA.y, z), this.project(ARENA.x, -ARENA.y, z),
        this.project(ARENA.x, ARENA.y, z), this.project(-ARENA.x, ARENA.y, z),
      ];
      const far = corners(farZ), near = corners(nearZ);
      this.polygon(far, 'rgba(2,8,22,.72)', accent, 1.4, 0.72);
      for (let index = 0; index < 4; index += 1) this.line([near[index], far[index]], accent, 1.15, 0.36);
      for (let step = 0; step <= 12; step += 1) {
        const t = step / 12;
        const z = lerp(farZ, nearZ, t);
        const ring = corners(z);
        const alpha = 0.08 + t * 0.12;
        this.polygon(ring, null, step % 3 === 0 ? accent : mid, step % 3 === 0 ? 1.15 : 0.65, alpha);
      }
      for (let lane = -4; lane <= 4; lane += 1) {
        const x = ARENA.x * lane / 4;
        this.line([this.project(x, -ARENA.y, farZ), this.project(x, -ARENA.y, nearZ)], accent, 0.65, 0.13);
        this.line([this.project(x, ARENA.y, farZ), this.project(x, ARENA.y, nearZ)], accent, 0.65, 0.11);
      }
      for (let lane = -2; lane <= 2; lane += 1) {
        const y = ARENA.y * lane / 2;
        this.line([this.project(-ARENA.x, y, farZ), this.project(-ARENA.x, y, nearZ)], accent, 0.65, 0.1);
        this.line([this.project(ARENA.x, y, farZ), this.project(ARENA.x, y, nearZ)], accent, 0.65, 0.1);
      }
      const centerA = this.project(0, 0, -0.5), centerB = this.project(0, 0, 0.5);
      this.line([centerA, centerB], '#ffffff', 2, 0.45);
    }
    drawModifiers(accent) {
      const game = this.game, stage = game.stage;
      const drawGate = (z, phase) => {
        const center = game.gateCenter(z, phase);
        const projected = this.project(center.x, center.y, z);
        if (!projected.visible) return;
        const radius = game.gateRadius * projected.scale;
        const ctx = this.context;
        ctx.save();
        ctx.globalAlpha = 0.58 + Math.sin(game.combatTime * 4 + phase) * 0.1;
        ctx.strokeStyle = phase ? '#ff4dd8' : accent;
        ctx.lineWidth = clamp(projected.scale * 0.11, 1.2, 4);
        ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.ellipse(projected.x, projected.y, radius, radius, game.combatTime * 0.25 + phase, 0, TAU); ctx.stroke();
        ctx.globalAlpha *= 0.45; ctx.lineWidth *= 0.45;
        ctx.beginPath(); ctx.ellipse(projected.x, projected.y, radius * 0.72, radius * 0.72, -game.combatTime * 0.4, 0, TAU); ctx.stroke();
        ctx.restore();
      };
      if (stage.gate) drawGate(0, 0);
      if (stage.secondGate) drawGate(-7.4, 1.7);
      if (stage.pulse) {
        for (const z of [-8, 8]) {
          const p1 = this.project(-ARENA.x, 0, z), p2 = this.project(ARENA.x, 0, z);
          const wave = 0.12 + 0.08 * (1 + Math.sin(game.combatTime * stage.pulse + z));
          this.line([p1, p2], '#ffe06a', 3, wave);
        }
      }
    }
    paddlePoints(paddle) {
      const weapon = paddle.weapon;
      if (weapon.id === 'orb') return null;
      if (weapon.id === 'blade') {
        return [
          this.project(paddle.x - weapon.width / 2, paddle.y - weapon.height / 2, paddle.z),
          this.project(paddle.x + weapon.width / 2, paddle.y - weapon.height / 2, paddle.z),
          this.project(paddle.x + weapon.width / 2, paddle.y + weapon.height / 2, paddle.z),
          this.project(paddle.x - weapon.width / 2, paddle.y + weapon.height / 2, paddle.z),
        ];
      }
      return [
        this.project(paddle.x, paddle.y + weapon.height / 2, paddle.z),
        this.project(paddle.x + weapon.width / 2, paddle.y - weapon.height / 2, paddle.z),
        this.project(paddle.x - weapon.width / 2, paddle.y - weapon.height / 2, paddle.z),
      ];
    }
    drawPaddle(paddle, player) {
      const projected = this.project(paddle.x, paddle.y, paddle.z);
      if (!projected.visible) return;
      const ctx = this.context, weapon = paddle.weapon;
      const color = player ? weapon.color : '#ff4dd8';
      const parry = this.game.combatTime <= paddle.parryUntil;
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = player ? 19 : 10;
      ctx.lineWidth = clamp(projected.scale * (player ? 0.08 : 0.11), 1.3, 5);
      ctx.strokeStyle = parry ? '#ffffff' : color;
      ctx.globalAlpha = player ? 0.9 : 0.68;
      if (weapon.id === 'orb') {
        const radius = weapon.radius * projected.scale;
        ctx.beginPath(); ctx.arc(projected.x, projected.y, radius, 0, TAU); ctx.stroke();
        ctx.globalAlpha *= 0.48; ctx.lineWidth *= 0.48;
        ctx.beginPath(); ctx.arc(projected.x, projected.y, radius * 0.58, 0, TAU); ctx.stroke();
      } else {
        const points = this.paddlePoints(paddle);
        this.polygon(points, player ? 'rgba(85,246,255,.025)' : 'rgba(255,77,216,.12)', parry ? '#fff' : color, ctx.lineWidth, player ? 0.96 : 0.68);
        if (weapon.id === 'spike') {
          const tip = points[0];
          ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffe06a';
          ctx.beginPath(); ctx.arc(tip.x, tip.y, clamp(projected.scale * 0.15, 2, 8), 0, TAU); ctx.fill();
        }
      }
      if (paddle.shieldCharges > 0 && this.game.combatTime < paddle.shieldUntil) {
        const radius = (weapon.id === 'orb' ? weapon.radius + 0.85 : Math.max(weapon.width, weapon.height) * 0.64) * projected.scale;
        ctx.globalAlpha = 0.3 + Math.sin(this.game.combatTime * 8) * 0.05;
        ctx.strokeStyle = '#70ffb1'; ctx.lineWidth = clamp(projected.scale * 0.055, 1.1, 4);
        ctx.beginPath(); ctx.ellipse(projected.x, projected.y, radius, radius * 0.74, this.game.combatTime * (player ? 0.45 : -0.45), 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    drawTrail() {
      const trail = this.game.ball.trail;
      const color = this.game.ball.lastHitter === 'player' ? '#55f6ff' : '#ff4dd8';
      for (let index = 0; index < trail.length; index += 1) {
        const point = trail[index];
        const projected = this.project(point.x, point.y, point.z);
        if (!projected.visible) continue;
        const progress = (index + 1) / trail.length;
        const radius = BALL_RADIUS * projected.scale * (0.08 + progress * 0.38);
        this.context.save();
        this.context.globalAlpha = progress * progress * 0.42;
        this.context.fillStyle = color;
        this.context.shadowColor = color; this.context.shadowBlur = 10;
        this.context.beginPath(); this.context.arc(projected.x, projected.y, Math.max(0.7, radius), 0, TAU); this.context.fill();
        this.context.restore();
      }
    }
    drawBall() {
      const ball = this.game.ball;
      const projected = this.project(ball.x, ball.y, ball.z);
      if (!projected.visible) return;
      const radius = Math.max(2.2, BALL_RADIUS * projected.scale);
      const color = ball.heldBy ? '#ffe06a' : ball.lastHitter === 'player' ? '#79fbff' : '#ff72df';
      const ctx = this.context;
      const gradient = ctx.createRadialGradient(projected.x - radius * 0.28, projected.y - radius * 0.32, 1, projected.x, projected.y, radius);
      gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.24, color); gradient.addColorStop(1, 'rgba(10,30,55,.18)');
      ctx.save(); ctx.fillStyle = gradient; ctx.shadowColor = color; ctx.shadowBlur = radius * 1.45;
      ctx.beginPath(); ctx.arc(projected.x, projected.y, radius, 0, TAU); ctx.fill();
      const spin = magnitude(ball.spinX, ball.spinY);
      if (spin > 0.6) {
        ctx.globalAlpha = clamp(spin / 12, 0.15, 0.65); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, radius * 0.09);
        ctx.beginPath(); ctx.ellipse(projected.x, projected.y, radius * 0.72, radius * 0.24, Math.atan2(ball.spinY, ball.spinX) + this.game.combatTime * 2, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    drawParticles() {
      for (const item of this.game.particles.items) {
        const projected = this.project(item.x, item.y, item.z);
        if (!projected.visible) continue;
        const alpha = clamp(item.life / item.maxLife, 0, 1);
        const radius = Math.max(0.8, item.size * projected.scale);
        this.context.save(); this.context.globalAlpha = alpha; this.context.fillStyle = item.color;
        this.context.shadowColor = item.color; this.context.shadowBlur = 8;
        this.context.beginPath(); this.context.arc(projected.x, projected.y, radius, 0, TAU); this.context.fill(); this.context.restore();
      }
    }
    drawTargetReticle() {
      if (!['play', 'countdown', 'point'].includes(this.game.state)) return;
      const p = this.project(this.game.player.targetX, this.game.player.targetY, ARENA.playerZ - 0.2);
      const ctx = this.context;
      ctx.save(); ctx.globalAlpha = 0.38; ctx.strokeStyle = this.game.player.weapon.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x - 5, p.y); ctx.moveTo(p.x + 5, p.y); ctx.lineTo(p.x + 14, p.y); ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x, p.y - 5); ctx.moveTo(p.x, p.y + 5); ctx.lineTo(p.x, p.y + 14); ctx.stroke();
      ctx.restore();
    }
    drawVignette() {
      const ctx = this.context;
      const vignette = ctx.createRadialGradient(this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.22, this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.72);
      vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,.56)');
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  class CurvebreakGame {
    constructor() {
      this.canvas = $('#arena');
      this.context = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (!this.context) throw new Error('Canvas 2D indisponível');
      this.random = new SeededRandom(0xc0febabe);
      this.audio = new SynthAudio(this.random);
      this.particles = new ParticleField(this.random);
      this.player = new Paddle(this, 'player');
      this.enemy = new Paddle(this, 'enemy');
      this.ball = new Ball(this);
      this.renderer = new ArenaRenderer(this.canvas, this.context, this);
      this.state = 'menu';
      this.mode = 'campaign';
      this.selectedStage = 0;
      this.difficulty = 0;
      this.chaos = false;
      this.unlockedStage = clamp(Number(safeStorage.get('curvebreakUnlocked', 0)) || 0, 0, STAGES.length - 1);
      this.stage = STAGES[0];
      this.combatTime = 0;
      this.frame = 0;
      this.rally = 0;
      this.pointTimer = 0;
      this.countdown = 0;
      this.hitstop = 0;
      this.trauma = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      this.fovPunch = 0;
      this.lastEvent = 'boot';
      this.errors = [];
      this.keys = new Set();
      this.pointerActive = false;
      this.pointerId = null;
      this.calloutTimer = 0;
      this.statusTimer = 0;
      this.lastTimestamp = performance.now();
      this.accumulator = 0;
      this.bindUI();
      this.buildStageMap();
      this.selectStage(0);
      this.updateHUD();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    bindUI() {
      $('#campaignTab').addEventListener('click', () => this.setMode('campaign'));
      $('#duelTab').addEventListener('click', () => this.setMode('duel'));
      document.querySelectorAll('.difficulty').forEach(button => button.addEventListener('click', () => {
        this.difficulty = Number(button.dataset.difficulty) || 0;
        document.querySelectorAll('.difficulty').forEach(item => item.classList.toggle('active', item === button));
      }));
      $('#chaosToggle').addEventListener('change', event => { this.chaos = Boolean(event.target.checked); });
      $('#startBtn').addEventListener('click', () => { this.audio.unlock(); this.startMatch(); });
      $('#pauseBtn').addEventListener('click', () => this.togglePause());
      $('#resumeBtn').addEventListener('click', () => this.togglePause());
      $('#restartBtn').addEventListener('click', () => this.startMatch());
      $('#menuBtn').addEventListener('click', () => this.returnToMenu());
      $('#resultMenuBtn').addEventListener('click', () => this.returnToMenu());
      $('#nextBtn').addEventListener('click', () => this.nextStage());
      $('#weaponBtn').addEventListener('click', () => this.player.cycleWeapon(true));
      $('#dashBtn').addEventListener('click', () => this.player.dash(this.combatTime));
      $('#shieldBtn').addEventListener('click', () => this.player.shield(this.combatTime));

      const parryButton = $('#parryBtn');
      const pressParry = event => {
        event.preventDefault();
        parryButton.classList.add('pressed');
        this.player.pressParry(this.combatTime);
      };
      const releaseParry = event => {
        event.preventDefault();
        parryButton.classList.remove('pressed');
        this.player.releaseParry();
      };
      parryButton.addEventListener('pointerdown', pressParry);
      parryButton.addEventListener('pointerup', releaseParry);
      parryButton.addEventListener('pointercancel', releaseParry);
      parryButton.addEventListener('lostpointercapture', releaseParry);

      const setPointerTarget = event => {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.setTargetFromScreen(x, y);
      };
      this.canvas.addEventListener('pointerdown', event => {
        event.preventDefault();
        this.pointerActive = true; this.pointerId = event.pointerId;
        try { this.canvas.setPointerCapture(event.pointerId); } catch (_) {}
        setPointerTarget(event);
      });
      this.canvas.addEventListener('pointermove', event => {
        if (!this.pointerActive || event.pointerId !== this.pointerId) return;
        event.preventDefault(); setPointerTarget(event);
      });
      const endPointer = event => {
        if (event.pointerId !== this.pointerId) return;
        this.pointerActive = false; this.pointerId = null;
      };
      this.canvas.addEventListener('pointerup', endPointer);
      this.canvas.addEventListener('pointercancel', endPointer);

      window.addEventListener('keydown', event => {
        const actionKeys = ['Space', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'KeyP', 'Escape'];
        if (actionKeys.includes(event.code)) event.preventDefault();
        if (!event.repeat) {
          if (event.code === 'Space') this.player.pressParry(this.combatTime);
          if (event.code === 'KeyQ') this.player.cycleWeapon(true);
          if (event.code === 'KeyE') this.player.shield(this.combatTime);
          if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.player.dash(this.combatTime);
          if (event.code === 'KeyP' || event.code === 'Escape') this.togglePause();
        }
        this.keys.add(event.code);
      }, { passive: false });
      window.addEventListener('keyup', event => {
        this.keys.delete(event.code);
        if (event.code === 'Space') this.player.releaseParry();
      });
      window.addEventListener('blur', () => {
        this.keys.clear(); this.player.releaseParry();
        if (this.state === 'play') this.togglePause();
      });
      window.addEventListener('resize', () => this.renderer.resize(), { passive: true });
      window.addEventListener('error', event => this.errors.push(String(event.error?.message || event.message || 'window error')));
      window.addEventListener('unhandledrejection', event => this.errors.push(String(event.reason?.message || event.reason || 'rejection')));
    }

    buildStageMap() {
      const map = $('#stageMap'); map.textContent = '';
      STAGES.forEach((stage, index) => {
        const button = document.createElement('button');
        button.className = `stage-node${index > this.unlockedStage ? ' locked' : ''}${index < this.unlockedStage ? ' complete' : ''}${stage.boss ? ' boss' : ''}`;
        button.dataset.stage = String(index);
        button.innerHTML = `<b>${String(index + 1).padStart(2, '0')}</b><small>${stage.short}</small>`;
        button.disabled = index > this.unlockedStage;
        button.addEventListener('click', () => this.selectStage(index));
        map.appendChild(button);
      });
    }

    selectStage(index) {
      this.selectedStage = clamp(index, 0, this.unlockedStage);
      const stage = STAGES[this.selectedStage];
      document.querySelectorAll('.stage-node').forEach(node => node.classList.toggle('selected', Number(node.dataset.stage) === this.selectedStage));
      $('#stageIndex').textContent = `NÓ ${String(this.selectedStage + 1).padStart(2, '0')}`;
      $('#stageName').textContent = stage.name;
      $('#stageStory').textContent = stage.story;
      $('#stageThreat').textContent = stage.threat;
      $('#stageModifier').textContent = stage.modifier;
    }

    setMode(mode) {
      this.mode = mode;
      $('#campaignTab').classList.toggle('active', mode === 'campaign');
      $('#duelTab').classList.toggle('active', mode === 'duel');
      $('#campaignTab').setAttribute('aria-selected', String(mode === 'campaign'));
      $('#duelTab').setAttribute('aria-selected', String(mode === 'duel'));
      $('#campaignPane').classList.toggle('hidden', mode !== 'campaign');
      $('#duelPane').classList.toggle('hidden', mode !== 'duel');
    }

    makeDuelStage() {
      const base = STAGES[Math.min(this.difficulty * 2, STAGES.length - 1)];
      return {
        ...base,
        name: `${AI_PRESETS[this.difficulty].label} DUEL`,
        short: 'DUEL', story: 'Partida competitiva sem progressão de campanha.',
        threat: `RIVAL: ${AI_PRESETS[this.difficulty].label}`,
        modifier: this.chaos ? 'RIFT INSTÁVEL' : 'ARENA LIMPA',
        ai: this.difficulty, enemyWeapon: this.difficulty === 2 ? 1 : 0,
        playerCores: 5, enemyCores: 5,
        gate: this.chaos, secondGate: false, gateMove: this.chaos ? 1.1 : 0,
        wind: this.chaos ? 0.75 : 0, pulse: this.chaos ? 1.2 : 0,
        enemyAbilities: this.difficulty > 0,
      };
    }

    startMatch() {
      this.stage = this.mode === 'campaign' ? STAGES[this.selectedStage] : this.makeDuelStage();
      this.state = 'countdown';
      this.combatTime = 0; this.rally = 0; this.countdown = 1.12; this.pointTimer = 0; this.hitstop = 0;
      this.player.reset(this.stage.playerCores, 0);
      this.enemy.reset(this.stage.enemyCores, this.stage.enemyWeapon);
      this.ball.reset();
      this.particles.items.length = 0;
      this.lastEvent = 'match-start';
      this.hidePanels();
      this.setStatus('SINCRONIZANDO ARENA', 1.2);
      this.callout(this.stage.name.toUpperCase(), this.stage.modifier, this.stage.theme[0], 0.8);
      this.updateHUD();
    }

    hidePanels() {
      $('#menu').classList.add('hidden');
      $('#pausePanel').classList.add('hidden');
      $('#resultPanel').classList.add('hidden');
    }

    returnToMenu() {
      this.state = 'menu'; this.ball.reset(); this.hidePanels();
      $('#menu').classList.remove('hidden');
      this.setStatus('SELECIONE UM NÓ');
      this.lastEvent = 'menu';
    }

    nextStage() {
      if (this.mode === 'campaign' && this.selectedStage < STAGES.length - 1) {
        this.selectStage(Math.min(this.selectedStage + 1, this.unlockedStage));
        this.startMatch();
      } else this.returnToMenu();
    }

    togglePause() {
      if (this.state === 'play' || this.state === 'countdown' || this.state === 'point') {
        this.previousState = this.state; this.state = 'pause';
        $('#pausePanel').classList.remove('hidden');
        $('#pauseBtn').textContent = '▶';
        this.lastEvent = 'pause';
      } else if (this.state === 'pause') {
        this.state = this.previousState || 'play';
        $('#pausePanel').classList.add('hidden');
        $('#pauseBtn').textContent = 'Ⅱ';
        this.lastTimestamp = performance.now();
        this.lastEvent = 'resume';
      }
    }

    setTargetFromScreen(screenX, screenY) {
      this.renderer.configureCamera();
      const depth = this.renderer.cameraZ - ARENA.playerZ;
      const scale = this.renderer.focal / depth;
      this.player.targetX = (screenX - this.renderer.centerX) / scale + this.renderer.cameraX;
      this.player.targetY = (this.renderer.centerY - screenY) / scale + this.renderer.cameraY;
      this.player.clampTarget();
    }

    keyboardInput(dt) {
      if (!['play', 'countdown', 'point'].includes(this.state)) return;
      let x = 0, y = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
      if (x || y) {
        const length = magnitude(x, y) || 1;
        this.player.targetX += x / length * this.player.weapon.moveSpeed * 0.83 * dt;
        this.player.targetY += y / length * this.player.weapon.moveSpeed * 0.83 * dt;
        this.player.clampTarget();
      }
    }

    serve() {
      const direction = this.rally === 0 ? -1 : (this.random.next() < 0.5 ? -1 : 1);
      this.ball.launch(direction);
      this.state = 'play';
      this.lastEvent = 'serve';
      this.setStatus(direction < 0 ? 'VOCÊ SERVE' : 'RIVAL SERVE', 0.7);
    }

    gateRadiusForStage() { return this.stage.boss ? 1.72 : 1.88; }
    get gateRadius() { return this.gateRadiusForStage(); }
    gateCenter(z, phase = 0) {
      const movement = this.stage.gateMove || 0;
      return {
        x: Math.sin(this.combatTime * 0.72 + phase + z * 0.05) * movement * 2.15,
        y: Math.cos(this.combatTime * 0.55 + phase * 1.7) * movement * 1.2,
      };
    }

    applyArenaForces(ball, dt) {
      const stage = this.stage;
      if (stage.wind) {
        const central = 1 - clamp(Math.abs(ball.z) / 18, 0, 1);
        const direction = Math.sin(this.combatTime * 0.8 + ball.z * 0.12);
        ball.vx += direction * stage.wind * central * dt;
      }
      if (stage.pulse) {
        const pulseA = Math.max(0, 1 - Math.abs(ball.z - 8) / 2.4);
        const pulseB = Math.max(0, 1 - Math.abs(ball.z + 8) / 2.4);
        const pulse = (pulseA - pulseB) * Math.sin(this.combatTime * stage.pulse);
        ball.vy += pulse * 3.2 * dt;
      }
    }

    checkGateCrossing(ball, previousZ) {
      if (!this.stage.gate || this.combatTime < ball.gateCooldownUntil) return;
      const gates = [{ z: 0, phase: 0 }];
      if (this.stage.secondGate) gates.push({ z: -7.4, phase: 1.7 });
      for (const gate of gates) {
        const crossed = (previousZ < gate.z && ball.z >= gate.z) || (previousZ > gate.z && ball.z <= gate.z);
        if (!crossed) continue;
        const center = this.gateCenter(gate.z, gate.phase);
        const distance = magnitude(ball.x - center.x, ball.y - center.y);
        if (distance <= this.gateRadius) {
          const rotation = gate.phase ? -0.26 : 0.24;
          const cos = Math.cos(rotation), sin = Math.sin(rotation);
          const vx = ball.vx * cos - ball.vy * sin;
          const vy = ball.vx * sin + ball.vy * cos;
          ball.vx = vx * 1.08; ball.vy = vy * 1.08; ball.vz *= 1.045;
          ball.spinX += (ball.y - center.y) * 0.65;
          ball.spinY -= (ball.x - center.x) * 0.65;
          ball.gateCooldownUntil = this.combatTime + 0.32;
          const hitter = ball.lastHitter === 'player' ? this.player : this.enemy;
          hitter.energy = clamp(hitter.energy + 12, 0, 100);
          this.audio.ability('gate'); this.particles.burst(ball.x, ball.y, gate.z, gate.phase ? '#ff4dd8' : this.stage.theme[0], 28, 1.15);
          this.addTrauma(0.13); this.punchFov(3.2); this.lastEvent = 'rift-gate';
          this.setStatus('RIFT BOOST', 0.5);
        } else {
          this.lastEvent = 'gate-miss';
        }
      }
    }

    predictBallAtZ(targetZ) {
      const ball = this.ball;
      if ((targetZ - ball.z) * ball.vz <= 0 || Math.abs(ball.vz) < 0.01) return { x: 0, y: 0, time: Infinity };
      let x = ball.x, y = ball.y, z = ball.z;
      let vx = ball.vx, vy = ball.vy, vz = ball.vz;
      let spinX = ball.spinX, spinY = ball.spinY;
      let time = 0;
      const step = 1 / 90;
      for (let index = 0; index < 260 && (targetZ - z) * vz > 0; index += 1) {
        const depthFactor = clamp(Math.abs(vz) / 38, 0.65, 1.5);
        vx += spinX * depthFactor * step; vy += spinY * depthFactor * step;
        const decay = Math.exp(-0.48 * step); spinX *= decay; spinY *= decay;
        x += vx * step; y += vy * step; z += vz * step; time += step;
        const xLimit = ARENA.x - BALL_RADIUS, yLimit = ARENA.y - BALL_RADIUS;
        if (x < -xLimit || x > xLimit) { x = clamp(x, -xLimit, xLimit); vx *= -0.96; spinX *= -0.55; }
        if (y < -yLimit || y > yLimit) { y = clamp(y, -yLimit, yLimit); vy *= -0.96; spinY *= -0.55; }
      }
      return { x, y, time };
    }

    updateAI(dt) {
      const ai = AI_PRESETS[this.stage.ai];
      const enemy = this.enemy;
      enemy.aiThink -= dt;
      if (enemy.aiThink <= 0) {
        enemy.aiThink = ai.reaction;
        const prediction = this.predictBallAtZ(ARENA.enemyZ + BALL_RADIUS);
        if (Number.isFinite(prediction.time)) {
          enemy.targetX = prediction.x + this.random.range(-ai.error, ai.error);
          enemy.targetY = prediction.y + this.random.range(-ai.error, ai.error);
        } else {
          enemy.targetX = damp(enemy.targetX, 0, 2.5, ai.reaction);
          enemy.targetY = damp(enemy.targetY, 0, 2.5, ai.reaction);
        }
        enemy.clampTarget();
      }

      const originalMoveSpeed = enemy.weapon.moveSpeed;
      const speedScale = ai.speed / originalMoveSpeed;
      const oldMoveSpeed = enemy.weapon.moveSpeed;
      enemy.weapon.moveSpeed = ai.speed;
      enemy.update(dt, this.combatTime);
      enemy.weapon.moveSpeed = oldMoveSpeed;

      if (this.ball.vz < 0) {
        const prediction = this.predictBallAtZ(ARENA.enemyZ + BALL_RADIUS);
        if (prediction.time < 0.22 && this.random.next() < ai.parry * dt * 18) enemy.pressParry(this.combatTime);
        if (this.stage.enemyAbilities && prediction.time < 0.38 && enemy.energy >= 26 && this.random.next() < ai.ability * dt * 7) enemy.dash(this.combatTime);
        if (this.stage.enemyAbilities && prediction.time < 0.3 && enemy.energy >= 38 && !enemy.contains(prediction.x, prediction.y) && this.random.next() < ai.ability * dt * 8) enemy.shield(this.combatTime);
      }
      if (this.stage.boss && this.rally > 0 && this.rally % 4 === 0 && this.lastBossCycle !== this.rally) {
        this.lastBossCycle = this.rally; enemy.cycleWeapon(false);
      }
    }

    reflectBall(ball, paddle, hitX, hitY, perfect) {
      const weapon = paddle.weapon;
      const dx = hitX - paddle.x, dy = hitY - paddle.y;
      const normX = weapon.id === 'orb' ? dx / weapon.radius : dx / (weapon.width / 2);
      const normY = weapon.id === 'orb' ? dy / weapon.radius : dy / (weapon.height / 2);
      const critical = weapon.id === 'spike' && isSpikeTip(dx, dy);
      let depthSpeed = Math.abs(ball.vz) * weapon.hitGain + 1.05 + Math.min(2.2, this.rally * 0.12);
      if (perfect) depthSpeed *= 1.16;
      if (critical) depthSpeed *= 1.24;
      depthSpeed = clamp(depthSpeed, this.stage.startDepth, this.stage.maxDepth);
      const direction = paddle.side === 'player' ? -1 : 1;
      const priorX = ball.vx, priorY = ball.vy;
      const velocityInfluence = weapon.id === 'orb' ? 0.68 : 0.56;
      ball.vx = clamp(normX * 8.7 + paddle.vx * velocityInfluence + priorX * 0.16, -16.5, 16.5);
      ball.vy = clamp(normY * 7.8 + paddle.vy * velocityInfluence + priorY * 0.16, -14.5, 14.5);
      ball.spinX = clamp((paddle.vx * 0.54 + normX * 3.6) * weapon.spinGain, -12, 12);
      ball.spinY = clamp((paddle.vy * 0.54 + normY * 3.25) * weapon.spinGain, -11, 11);
      ball.vz = direction * depthSpeed;
      ball.z = paddle.z + direction * 0.7;
      ball.lastHitter = paddle.side;
      this.rally += 1;
      paddle.energy = clamp(paddle.energy + (perfect ? 20 : critical ? 15 : 8), 0, 100);
      this.hitstop = Math.max(this.hitstop, perfect || critical ? 0.072 : 0.038);
      this.addTrauma(perfect || critical ? 0.34 : 0.18);
      this.punchFov(perfect || critical ? 6.5 : 2.8);
      this.audio.hit(perfect, critical);
      this.particles.burst(hitX, hitY, paddle.z, critical ? '#ffe06a' : perfect ? '#ffffff' : weapon.color, critical ? 34 : perfect ? 28 : 18, critical ? 1.45 : perfect ? 1.2 : 0.85);
      this.flash(perfect || critical ? 0.36 : 0.13);
      if (navigator.vibrate) navigator.vibrate(perfect || critical ? 26 : 12);
      this.lastEvent = critical ? `${paddle.side}-spike-critical` : perfect ? `${paddle.side}-perfect` : `${paddle.side}-hit`;
      if (critical) this.callout('SPIKE BREAK', 'CONTATO NA PONTA', '#ffe06a', 0.52);
      else if (perfect) this.callout('PERFECT', 'CURVA AMPLIFICADA', '#ffffff', 0.42);
      this.updateHUD();
    }

    catchBall(paddle) {
      this.ball.heldBy = paddle.side;
      this.ball.holdStarted = this.combatTime;
      this.ball.lastHitter = paddle.side;
      paddle.energy = clamp(paddle.energy + 12, 0, 100);
      this.audio.ability('catch'); this.addTrauma(0.17); this.punchFov(3.8);
      this.particles.burst(paddle.x, paddle.y, paddle.z, paddle.weapon.color, 30, 1.1);
      this.lastEvent = `${paddle.side}-catch`;
      if (paddle.side === 'player') {
        $('#chargeMeter').classList.add('visible');
        this.callout('CAPTURE', 'SEGURE O RITMO — TOQUE PARA SACAR', '#ff4dd8', 0.7);
      }
      this.updateHUD();
    }

    releaseCaughtBall(paddle) {
      if (this.ball.heldBy !== paddle.side) return;
      const charge = clamp((this.combatTime - this.ball.holdStarted) / 1.25, 0, 1);
      const power = lerp(this.stage.startDepth * 1.03, this.stage.maxDepth, charge);
      const direction = paddle.side === 'player' ? -1 : 1;
      const targetBiasX = clamp((paddle.targetX - paddle.x) * 1.4, -7.5, 7.5);
      const targetBiasY = clamp((paddle.targetY - paddle.y) * 1.4, -6.5, 6.5);
      this.ball.heldBy = null;
      this.ball.vz = direction * power;
      this.ball.vx = clamp(paddle.vx * 0.78 + targetBiasX, -17, 17);
      this.ball.vy = clamp(paddle.vy * 0.78 + targetBiasY, -15, 15);
      this.ball.spinX = clamp(paddle.vx * 0.75 + targetBiasX * 0.38, -13, 13);
      this.ball.spinY = clamp(paddle.vy * 0.75 + targetBiasY * 0.38, -12, 12);
      this.ball.z = paddle.z + direction * 0.78;
      this.rally += 1;
      $('#chargeMeter').classList.remove('visible');
      this.audio.ability('serve'); this.addTrauma(0.3 + charge * 0.18); this.punchFov(6 + charge * 3);
      this.particles.burst(paddle.x, paddle.y, paddle.z, '#ffe06a', 38, 1.25 + charge * 0.45);
      this.flash(0.32 + charge * 0.22);
      this.lastEvent = `${paddle.side}-power-serve`;
      if (paddle.side === 'player') this.callout(charge > 0.82 ? 'MAX SERVE' : 'POWER SERVE', `${Math.round(charge * 100)}% CHARGE`, '#ffe06a', 0.58);
    }

    shieldSave(ball, paddle, hitX, hitY) {
      const direction = paddle.side === 'player' ? -1 : 1;
      ball.vz = direction * clamp(Math.abs(ball.vz) * 0.92, this.stage.startDepth * 0.9, this.stage.maxDepth);
      ball.vx = (paddle.x - hitX) * 1.7 + paddle.vx * 0.25;
      ball.vy = (paddle.y - hitY) * 1.7 + paddle.vy * 0.25;
      ball.spinX *= -0.4; ball.spinY *= -0.4;
      ball.z = paddle.z + direction * 0.8;
      ball.lastHitter = paddle.side;
      this.addTrauma(0.26); this.audio.ability('shield');
      this.particles.burst(hitX, hitY, paddle.z, '#70ffb1', 32, 1.2);
      this.flash(0.24); this.lastEvent = `${paddle.side}-shield-save`;
      if (paddle.side === 'player') this.callout('SHIELD SAVE', 'NÚCLEO PRESERVADO', '#70ffb1', 0.56);
      this.updateHUD();
    }

    wallImpact(x, y, z) {
      this.audio.wall(); this.particles.burst(x, y, z, '#8bcfff', 7, 0.45); this.addTrauma(0.035);
    }

    loseCore(side) {
      if (this.state !== 'play') return;
      const loser = side === 'player' ? this.player : this.enemy;
      loser.cores = Math.max(0, loser.cores - 1);
      const playerWonPoint = side === 'enemy';
      this.audio.point(playerWonPoint); this.addTrauma(0.46); this.flash(0.42);
      this.particles.burst(this.ball.x, this.ball.y, this.ball.z, playerWonPoint ? '#55f6ff' : '#ff5d7d', 52, 1.6);
      this.lastEvent = `${side}-core-lost`;
      this.ball.reset();
      this.updateHUD();
      this.callout(playerWonPoint ? 'CORE BREAK' : 'CORE LOST', playerWonPoint ? 'PRESSÃO AUMENTADA' : 'RECALIBRANDO DEFESA', playerWonPoint ? '#55f6ff' : '#ff5d7d', 0.72);
      if (loser.cores <= 0) this.finishMatch(side === 'enemy');
      else { this.state = 'point'; this.pointTimer = 0.92; this.rally = 0; }
    }

    finishMatch(playerWon) {
      this.state = 'result';
      $('#resultPanel').classList.remove('hidden');
      $('#resultEyebrow').textContent = playerWon ? 'NÓ CONCLUÍDO' : 'SINAL INTERROMPIDO';
      $('#resultTitle').textContent = playerWon ? 'Vitória' : 'Derrota';
      $('#resultText').textContent = playerWon
        ? `Você quebrou ${this.stage.name}. As trajetórias deste nó foram adicionadas ao seu arquivo.`
        : 'O rival leu sua última sequência. Mude o ângulo, a velocidade da raquete ou a forma antes do próximo contato.';
      const next = $('#nextBtn');
      next.textContent = playerWon && this.mode === 'campaign' && this.selectedStage < STAGES.length - 1 ? 'Próximo nó' : 'Revanche';
      if (playerWon && this.mode === 'campaign' && this.selectedStage < STAGES.length - 1) {
        this.unlockedStage = Math.max(this.unlockedStage, this.selectedStage + 1);
        safeStorage.set('curvebreakUnlocked', this.unlockedStage);
        this.buildStageMap(); this.selectStage(this.selectedStage);
      }
      this.lastEvent = playerWon ? 'match-win' : 'match-loss';
    }

    addTrauma(amount) { this.trauma = clamp(this.trauma + amount, 0, 1); }
    punchFov(amount) { this.fovPunch = clamp(this.fovPunch + amount, 0, 10); }
    flash(opacity) {
      const element = $('#flash');
      element.getAnimations().forEach(animation => animation.cancel());
      element.animate([{ opacity }, { opacity: 0 }], { duration: 115, easing: 'ease-out' });
    }
    callout(title, text, color = '#55f6ff', duration = 0.5) {
      $('#calloutTitle').textContent = title; $('#calloutTitle').style.color = color;
      $('#calloutText').textContent = text; $('#callout').classList.add('show');
      this.calloutTimer = duration;
    }
    setStatus(text, duration = 0) { $('#statusLine').textContent = text; this.statusTimer = duration; }

    updateEffects(dt) {
      this.particles.update(dt);
      this.trauma = Math.max(0, this.trauma - 1.55 * dt);
      const shake = this.trauma * this.trauma;
      this.shakeX = Math.sin(this.frame * 2.17) * 7.5 * shake;
      this.shakeY = Math.cos(this.frame * 1.63) * 5.5 * shake;
      this.fovPunch *= Math.exp(-dt / 0.19);
      if (this.fovPunch < 0.01) this.fovPunch = 0;
      if (this.calloutTimer > 0) {
        this.calloutTimer -= dt;
        if (this.calloutTimer <= 0) $('#callout').classList.remove('show');
      }
      if (this.statusTimer > 0) {
        this.statusTimer -= dt;
        if (this.statusTimer <= 0 && this.state === 'play') this.setStatus('LEIA A CURVA — MUDE DURANTE O VOO');
      }
      if (this.ball.heldBy === 'player') {
        const charge = clamp((this.combatTime - this.ball.holdStarted) / 1.25, 0, 1);
        $('#chargeMeter span').style.width = `${charge * 100}%`;
      }
    }

    updateFixed(dt) {
      this.keyboardInput(dt);
      if (this.state === 'countdown') {
        this.player.update(dt, this.combatTime);
        this.updateAI(dt);
        this.countdown -= dt;
        if (this.countdown <= 0) this.serve();
        return;
      }
      if (this.state === 'point') {
        this.player.update(dt, this.combatTime);
        this.updateAI(dt);
        this.pointTimer -= dt;
        if (this.pointTimer <= 0) { this.countdown = 0.58; this.state = 'countdown'; }
        return;
      }
      if (this.state !== 'play') return;
      this.combatTime += dt;
      this.player.update(dt, this.combatTime);
      this.updateAI(dt);
      this.ball.update(dt);
    }

    updateHUD() {
      const drawCores = (container, paddle) => {
        container.textContent = '';
        for (let index = 0; index < paddle.maxCores; index += 1) {
          const core = document.createElement('i'); core.className = `core${index >= paddle.cores ? ' empty' : ''}`; container.appendChild(core);
        }
      };
      drawCores($('#playerCores'), this.player); drawCores($('#enemyCores'), this.enemy);
      $('#energyFill').style.width = `${this.player.energy}%`;
      $('#enemyEnergyFill').style.width = `${this.enemy.energy}%`;
      $('#playerWeapon').textContent = this.player.weapon.name;
      $('#enemyWeapon').textContent = this.enemy.weapon.name;
      $('#playerWeapon').style.color = this.player.weapon.color;
      $('#weaponGlyph').textContent = this.player.weapon.glyph;
      $('#stageLabel').textContent = this.stage.name.toUpperCase();
      $('#rallyLabel').textContent = `RALLY ${this.rally}`;
      $('#dashBtn').classList.toggle('cooldown', this.player.energy < 26 || this.combatTime < this.player.dashCooldownUntil);
      $('#shieldBtn').classList.toggle('cooldown', this.player.energy < 38 || this.player.shieldCharges > 0);
      $('#parryBtn').classList.toggle('ready', this.player.weapon.id === 'orb' && this.ball.vz > 0);
    }

    loop(timestamp) {
      const rawDt = clamp((timestamp - this.lastTimestamp) / 1000, 0, 0.05);
      this.lastTimestamp = timestamp;
      this.frame += 1;
      this.updateEffects(rawDt);
      if (this.state !== 'pause' && this.state !== 'menu' && this.state !== 'result') {
        if (this.hitstop > 0) this.hitstop = Math.max(0, this.hitstop - rawDt);
        else {
          this.accumulator += rawDt;
          let steps = 0;
          while (this.accumulator >= FIXED_DT && steps < 7) {
            this.updateFixed(FIXED_DT); this.accumulator -= FIXED_DT; steps += 1;
          }
          if (steps === 7) this.accumulator = 0;
        }
      } else this.accumulator = 0;
      this.updateHUD();
      this.renderer.render();
      requestAnimationFrame(this.loop);
    }

    diagnostics() {
      return {
        build: 'curvebreak-v2', frame: this.frame, state: this.state, combatTime: this.combatTime,
        stage: this.stage.name, mode: this.mode, rally: this.rally, lastEvent: this.lastEvent,
        canvas: { width: this.canvas.width, height: this.canvas.height, cssWidth: this.renderer.width, cssHeight: this.renderer.height, dpr: this.renderer.dpr, pixels: this.canvas.width * this.canvas.height },
        player: {
          x: this.player.x, y: this.player.y, targetX: this.player.targetX, targetY: this.player.targetY,
          vx: this.player.vx, vy: this.player.vy, energy: this.player.energy, cores: this.player.cores,
          weapon: this.player.weapon.id, shield: this.player.shieldCharges,
          dashActive: this.combatTime < this.player.dashUntil, parryActive: this.combatTime < this.player.parryUntil,
        },
        enemy: { x: this.enemy.x, y: this.enemy.y, energy: this.enemy.energy, cores: this.enemy.cores, weapon: this.enemy.weapon.id, shield: this.enemy.shieldCharges },
        ball: {
          x: this.ball.x, y: this.ball.y, z: this.ball.z, vx: this.ball.vx, vy: this.ball.vy, vz: this.ball.vz,
          spinX: this.ball.spinX, spinY: this.ball.spinY, speed: this.ball.speed(), flightTime: this.ball.depthFlightTime(), heldBy: this.ball.heldBy,
        },
        errors: [...this.errors],
      };
    }
  }

  function runSelfTests() {
    const tests = [];
    const test = (name, fn) => {
      try { tests.push({ name, pass: Boolean(fn()) }); }
      catch (error) { tests.push({ name, pass: false, error: String(error.message || error) }); }
    };
    test('blade-center-contact', () => shapeContains('blade', 0, 0));
    test('blade-outside-rejected', () => !shapeContains('blade', 4, 0));
    test('spike-tip-zone', () => shapeContains('spike', 0, 2.1) && isSpikeTip(0, 2.1));
    test('spike-corner-rejected', () => !shapeContains('spike', 2.6, 2.1));
    test('orb-radius-contact', () => shapeContains('orb', 2.5, 0) && !shapeContains('orb', 2.8, 0));
    test('depth-flight-readable', () => {
      const time = (ARENA.playerZ - ARENA.enemyZ) / STAGES[0].startDepth;
      return time > 0.8 && time < 1.1;
    });
    test('canvas-pixel-cap-positive', () => MAX_CANVAS_PIXELS >= 1_000_000 && MAX_CANVAS_PIXELS <= 2_000_000);
    test('fixed-step-high-frequency', () => FIXED_DT <= 1 / 100);
    return tests;
  }

  let game;
  try {
    game = new CurvebreakGame();
    window.__CURVEBREAK_GAME__ = game;
    window.__CURVEBREAK_SELFTEST__ = runSelfTests();
    Object.defineProperty(window, '__CURVEBREAK_DIAGNOSTICS__', { configurable: true, get: () => game.diagnostics() });
    window.__CURVEBREAK_TEST_HOOKS__ = {
      start(mode = 'campaign', stage = 0, difficulty = 0, chaos = false) {
        game.mode = mode; game.difficulty = difficulty; game.chaos = chaos;
        if (mode === 'campaign') { game.unlockedStage = STAGES.length - 1; game.buildStageMap(); game.selectStage(stage); }
        game.startMatch(); game.countdown = 0; game.serve();
      },
      setEnergy(value) { game.player.energy = clamp(value, 0, 100); game.updateHUD(); },
      setWeapon(index) { game.player.setWeapon(index, false); game.updateHUD(); },
      setPlayerTarget(x, y) { game.player.targetX = x; game.player.targetY = y; game.player.clampTarget(); },
      approachPlayer(seconds = 0.42, x = game.player.x, y = game.player.y) {
        game.state = 'play'; game.ball.heldBy = null; game.ball.x = x; game.ball.y = y;
        game.ball.vz = Math.abs(game.stage.startDepth); game.ball.z = ARENA.playerZ - BALL_RADIUS - game.ball.vz * seconds;
        game.ball.vx = 0; game.ball.vy = 0; game.ball.spinX = 0; game.ball.spinY = 0; game.ball.lastHitter = 'enemy';
      },
      approachEnemy(seconds = 0.42, x = game.enemy.x, y = game.enemy.y) {
        game.state = 'play'; game.ball.heldBy = null; game.ball.x = x; game.ball.y = y;
        game.ball.vz = -Math.abs(game.stage.startDepth); game.ball.z = ARENA.enemyZ + BALL_RADIUS - game.ball.vz * seconds;
        game.ball.vx = 0; game.ball.vy = 0; game.ball.spinX = 0; game.ball.spinY = 0; game.ball.lastHitter = 'player';
      },
      pressParry() { game.player.pressParry(game.combatTime); },
      releaseParry() { game.player.releaseParry(); },
      pause() { game.togglePause(); },
      returnToMenu() { game.returnToMenu(); },
      getStageCount() { return STAGES.length; },
    };
    window.__CURVEBREAK_BOOTED__ = true;
  } catch (error) {
    window.__CURVEBREAK_BOOTED__ = false;
    window.__CURVEBREAK_FATAL__ = String(error.stack || error);
    document.body.innerHTML = `<pre style="color:#fff;background:#18040b;padding:24px;white-space:pre-wrap">CURVEBREAK FATAL\n${String(error.stack || error)}</pre>`;
  }
})();
