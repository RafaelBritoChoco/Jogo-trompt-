(() => {
  'use strict';
  const game = window.__CURVEBREAK_GAME__;
  if (!game) throw new Error('Curvebreak core missing before v2 patch');

  game.lastMatchWon = false;
  const finishMatch = game.finishMatch.bind(game);
  game.finishMatch = function patchedFinishMatch(playerWon) {
    this.lastMatchWon = Boolean(playerWon);
    finishMatch(playerWon);
  };

  game.nextStage = function patchedNextStage() {
    if (this.lastMatchWon && this.mode === 'campaign' && this.selectedStage < 5) {
      this.selectStage(Math.min(this.selectedStage + 1, this.unlockedStage));
      this.startMatch();
      return;
    }
    this.startMatch();
  };

  const coreContainers = {
    player: document.querySelector('#playerCores'),
    enemy: document.querySelector('#enemyCores'),
  };
  let coreSignature = '';

  function renderCores(container, paddle) {
    container.textContent = '';
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < paddle.maxCores; index += 1) {
      const core = document.createElement('i');
      core.className = `core${index >= paddle.cores ? ' empty' : ''}`;
      fragment.appendChild(core);
    }
    container.appendChild(fragment);
  }

  game.updateHUD = function optimizedHUD() {
    const signature = `${this.player.cores}/${this.player.maxCores}:${this.enemy.cores}/${this.enemy.maxCores}`;
    if (signature !== coreSignature) {
      coreSignature = signature;
      renderCores(coreContainers.player, this.player);
      renderCores(coreContainers.enemy, this.enemy);
    }
    document.querySelector('#energyFill').style.width = `${this.player.energy}%`;
    document.querySelector('#enemyEnergyFill').style.width = `${this.enemy.energy}%`;
    const playerWeapon = document.querySelector('#playerWeapon');
    playerWeapon.textContent = this.player.weapon.name;
    playerWeapon.style.color = this.player.weapon.color;
    document.querySelector('#enemyWeapon').textContent = this.enemy.weapon.name;
    document.querySelector('#weaponGlyph').textContent = this.player.weapon.glyph;
    document.querySelector('#stageLabel').textContent = this.stage.name.toUpperCase();
    document.querySelector('#rallyLabel').textContent = `RALLY ${this.rally}`;
    document.querySelector('#dashBtn').classList.toggle('cooldown', this.player.energy < 26 || this.combatTime < this.player.dashCooldownUntil);
    document.querySelector('#shieldBtn').classList.toggle('cooldown', this.player.energy < 38 || this.player.shieldCharges > 0);
    document.querySelector('#parryBtn').classList.toggle('ready', this.player.weapon.id === 'orb' && this.ball.vz > 0);
  };

  game.updateHUD();
  document.documentElement.dataset.build = 'curvebreak-v2.1';
  window.__CURVEBREAK_PATCHED__ = true;
})();
