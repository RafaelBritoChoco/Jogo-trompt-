from __future__ import annotations

from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Patch target not found: {label}")
    return text.replace(old, new, 1)


def patch_tests(path: Path) -> None:
    text = path.read_text(encoding="utf-8")

    old_abilities = """    await page.evaluate(() => window.__ARC_PONG_TEST_HOOKS__.setEnergy(100));
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
    );"""

    new_abilities = """    await page.evaluate(() => {
      window.__ARC_PONG_TEST_HOOKS__.setEnergy(100);
      window.__ARC_PONG_TEST_HOOKS__.approachEnemy(0, 0, 2);
    });
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.state === 'play',
      `${engine}: dash scenario did not enter play`,
    );
    const dashEnergyBefore = await page.evaluate(
      () => window.__ARC_PONG_DIAGNOSTICS__.player.energy,
    );
    await activate(page, touch, '#dashBtn', 'ShiftLeft');
    await waitState(
      page,
      () => {
        const player = window.__ARC_PONG_DIAGNOSTICS__?.player;
        return player && player.energy < 80;
      },
      `${engine}: dash did not consume energy`,
    );
    const dashEnergyAfter = await page.evaluate(
      () => window.__ARC_PONG_DIAGNOSTICS__.player.energy,
    );
    assert(
      dashEnergyBefore - dashEnergyAfter > 20,
      `${engine}: dash energy delta was too small`,
    );

    await page.evaluate(() => {
      window.__ARC_PONG_TEST_HOOKS__.setEnergy(100);
      window.__ARC_PONG_TEST_HOOKS__.approachEnemy(0, 0, 2);
    });
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.state === 'play',
      `${engine}: shield scenario did not enter play`,
    );
    await activate(page, touch, '#shieldBtn', 'KeyE');
    await waitState(
      page,
      () => window.__ARC_PONG_DIAGNOSTICS__?.player.shield === 1,
      `${engine}: shield did not activate`,
    );"""

    text = replace_once(
        text,
        old_abilities,
        new_abilities,
        "isolated dash and shield scenarios",
    )

    visual_anchor = """    const weaponAfter = await page.evaluate(() => window.__ARC_PONG_DIAGNOSTICS__.player.weapon);
    assert(weaponAfter !== weaponBefore, `${engine}: weapon unchanged`);
"""

    visual_contract = """    const weaponAfter = await page.evaluate(() => window.__ARC_PONG_DIAGNOSTICS__.player.weapon);
    assert(weaponAfter !== weaponBefore, `${engine}: weapon unchanged`);

    const playerVisuals = await page.evaluate(() => {
      const forms = [];
      for (const index of [0, 1, 2]) {
        window.__ARC_PONG_TEST_HOOKS__.setWeapon(index);
        const meshes = [];
        window.__ARC_PONG_GAME__.player.mesh.traverse(object => {
          if (!object.isMesh) return;
          meshes.push({
            type: object.geometry?.type ?? 'unknown',
            opacity: object.material?.opacity ?? 1,
            depthWrite: object.material?.depthWrite ?? true,
          });
        });
        forms.push({ index, meshes });
      }
      return forms;
    });
    for (const form of playerVisuals) {
      assert(
        form.meshes.every(mesh => mesh.depthWrite === false),
        `${engine}: player paddle writes to depth buffer`,
      );
      if (form.index < 2) {
        const blockingOpacity = Math.max(
          0,
          ...form.meshes
            .filter(mesh => !['RingGeometry', 'TorusGeometry'].includes(mesh.type))
            .map(mesh => mesh.opacity),
        );
        assert(
          blockingOpacity <= 0.08,
          `${engine}: player paddle still blocks the arena`,
        );
      } else {
        assert(
          form.meshes.some(mesh => mesh.type === 'TorusGeometry'),
          `${engine}: Orb is not rendered as an open ring`,
        );
        assert(
          !form.meshes.some(mesh => mesh.type === 'SphereGeometry'),
          `${engine}: Orb still uses a blocking sphere`,
        );
      }
    }
"""

    if "playerVisuals = await page.evaluate" not in text:
        if visual_anchor not in text:
            raise RuntimeError("Patch target not found: player visual contract")
        text = text.replace(visual_anchor, visual_contract, 1)

    path.write_text(text, encoding="utf-8")


def patch_game(path: Path) -> None:
    html = path.read_text(encoding="utf-8")

    if "visualMode:isPlayer?'hologram-outline':'solid'" not in html:
        shield_pattern = re.compile(
            r"createShieldMesh\(\)\{.*?\}buildWeaponMesh\(\)\{",
            re.S,
        )
        shield_replacement = """createShieldMesh(){const group=new THREE.Group,color=this.side==='player'?0x69ffb0:0xff75e5,mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}),ring=new THREE.Mesh(new THREE.RingGeometry(3.5,3.62,64),mat);group.add(ring);const lineMat=new THREE.LineBasicMaterial({color,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),pts=[];for(let i=0;i<=64;i++){const a=i/64*TAU;pts.push(new THREE.Vector3(Math.cos(a)*4.75,Math.sin(a)*3.35,0))}group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineMat));group.position.z=this.side==='player'?TUNING.goalZ-.22:-TUNING.goalZ+.22;group.userData={mat,lineMat};return group}buildWeaponMesh(){"""
        html, shield_count = shield_pattern.subn(shield_replacement, html, count=1)
        if shield_count != 1:
            raise RuntimeError(f"Shield patch matched {shield_count} times")

        weapon_pattern = re.compile(
            r"buildWeaponMesh\(\)\{.*?\}setWeapon\(index,announce=true\)\{",
            re.S,
        )
        weapon_replacement = """buildWeaponMesh(){while(this.mesh.children.length){const child=this.mesh.children[0];this.mesh.remove(child);child.geometry?.dispose?.();if(Array.isArray(child.material))child.material.forEach(m=>m.dispose?.());else child.material?.dispose?.()}const w=this.weapon,isPlayer=this.side==='player',fillMaterial=new THREE.MeshBasicMaterial({color:w.color,transparent:true,opacity:isPlayer?.035:.34,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}),frameMaterial=new THREE.LineBasicMaterial({color:isPlayer?w.color:0xffffff,transparent:true,opacity:isPlayer?.88:.42,blending:THREE.AdditiveBlending,depthWrite:false});let geometry,body,frame;if(w.id==='orb'&&isPlayer){const outerMaterial=new THREE.MeshBasicMaterial({color:w.color,transparent:true,opacity:.78,blending:THREE.AdditiveBlending,depthWrite:false}),innerMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false});body=new THREE.Mesh(new THREE.TorusGeometry(w.radius*.82,.095,8,72),outerMaterial);frame=new THREE.Mesh(new THREE.TorusGeometry(w.radius*.53,.04,6,64),innerMaterial);this.mesh.add(body,frame);this.mesh.userData={body,wire:frame,material:outerMaterial,frameMaterial:innerMaterial,visualMode:'hologram-outline'};return}if(w.id==='blade')geometry=new THREE.BoxGeometry(w.width,w.height,.42,2,2,1);else if(w.id==='spike'){const shape=new THREE.Shape;shape.moveTo(-w.width/2,-w.height/2);shape.lineTo(w.width/2,-w.height/2);shape.lineTo(0,w.height/2);shape.closePath();geometry=new THREE.ExtrudeGeometry(shape,{depth:.42,bevelEnabled:true,bevelSize:.12,bevelThickness:.1,bevelSegments:2});geometry.center()}else{geometry=new THREE.SphereGeometry(w.radius,32,18);geometry.scale(1,1,.17)}body=new THREE.Mesh(geometry,fillMaterial);frame=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,18),frameMaterial);body.rotation.y=this.side==='player'?0:Math.PI;frame.rotation.copy(body.rotation);this.mesh.add(body,frame);if(isPlayer){const reticleMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.72,blending:THREE.AdditiveBlending,depthWrite:false}),reticle=new THREE.Mesh(new THREE.RingGeometry(.2,.29,24),reticleMaterial);reticle.position.z=-.24;this.mesh.add(reticle)}this.mesh.userData={body,wire:frame,material:fillMaterial,frameMaterial,visualMode:isPlayer?'hologram-outline':'solid'}}setWeapon(index,announce=true){"""
        html, weapon_count = weapon_pattern.subn(weapon_replacement, html, count=1)
        if weapon_count != 1:
            raise RuntimeError(f"Weapon patch matched {weapon_count} times")

        old_pulse = "const mat=this.mesh.userData.material;if(mat)mat.emissiveIntensity=time<this.parryUntil?3.3:time<this.dashUntil?2.6:1.5;const active=this.shieldCharges>0&&time<this.shieldUntil,sm=this.shieldMesh.userData.mat,sl=this.shieldMesh.userData.lineMat;sm.opacity=lerp(sm.opacity,active?.3+Math.sin(time*8)*.08:0,1-Math.exp(-12*dt));sl.opacity=sm.opacity*1.3;"
        new_pulse = "const mat=this.mesh.userData.material,frameMat=this.mesh.userData.frameMaterial;if(mat&&'emissiveIntensity'in mat)mat.emissiveIntensity=time<this.parryUntil?3.3:time<this.dashUntil?2.6:1.5;if(frameMat)frameMat.opacity=clamp((this.side==='player'?.78:.42)+(time<this.parryUntil?.16:0),0,1);const active=this.shieldCharges>0&&time<this.shieldUntil,sm=this.shieldMesh.userData.mat,sl=this.shieldMesh.userData.lineMat;sm.opacity=lerp(sm.opacity,active?.11+Math.sin(time*8)*.025:0,1-Math.exp(-12*dt));sl.opacity=Math.min(.26,sm.opacity*2);"
        if old_pulse not in html:
            raise RuntimeError("Patch target not found: paddle and shield pulse")
        html = html.replace(old_pulse, new_pulse, 1)

    path.write_text(html, encoding="utf-8")


def main() -> None:
    patch_tests(Path("tests/arc-pong-audit.cjs"))
    patch_game(Path("index.html"))


if __name__ == "__main__":
    main()
