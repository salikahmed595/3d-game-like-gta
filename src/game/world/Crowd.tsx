// Pedestrians: every non-playable roster character (plus the playable ones the player didn't pick, and a few
// repeats so streets feel busy) is a simulated person from systems/people.ts. This file only draws them: pose from
// their state, lying down when knocked over, tumbling when hit by a car. Scott idles by the office and Spanner Boy
// is a statue. Each model loads lazily; a failed one just leaves a gap (rules §61).
import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clutchWound, computePose, dyingPose, flinch, weaponArms } from "../animations/poses.ts";
import { placeHeld, placeInHand, useWeaponModel } from "./Combat.tsx";
import { weaponModelUrl } from "../systems/weapons.ts";
import { DRACO_PATH } from "./CityMap.tsx";
import type { CharacterModel } from "../character/rig.ts";
import type { CharacterAnimationState } from "../../types/game.ts";
import { applyPose, newPoseState, prepareCharacter } from "../character/rig.ts";
import { useAvatarCharacter } from "../character/Avatar.tsx";
import { CHARACTERS, characterDef, characterUrl } from "../../../shared/characters.ts";
import { crowd, lerpAngle, player, streetStand } from "../systems/explore.ts";
import { addPerson, people, removePerson, stepPerson } from "../systems/people.ts";
import { PLAYABLE, charSpot } from "../systems/switcher.ts";
import { openSpot } from "./layout.ts";
import type { Person } from "../systems/people.ts";
import { useGame } from "../state/store.ts";
import { time } from "../systems/time.ts";
import { gfx } from "../settings.ts";
import { Shadow } from "./Shadow.tsx";

const heightOf = (id: string) => characterDef(id)?.height ?? 1.75;

function animOf(p: Person): CharacterAnimationState {
  switch (p.state) {
    case "air": case "down": case "getup": case "dead": return "down";
    case "cop": return p.attackT > 0 ? (p.punchSide === 1 ? "punch-right" : "punch-left") : p.speed > 2.6 ? "run" : p.speed > 0.15 ? "walk" : "idle";
    case "stagger": return "stagger";
    case "flee": return "run";
    case "fight": return p.attackT > 0 ? (p.punchSide === 1 ? "punch-right" : "punch-left") : p.speed > 2.5 ? "run" : "guard";
    case "wave": return "wave";
    default: return p.speed > 0.15 ? "walk" : "idle";
  }
}

function Pedestrian({ id }: { id: string }) {
  const p = people.get(id)!;
  const { scene } = useGLTF(characterUrl(p.charId));
  const model = useMemo(() => {
    const m = prepareCharacter(scene, heightOf(p.charId));
    m.meshes.forEach((mesh) => { mesh.castShadow = false; }); // blob shadow instead: the shadow pass would re-skin everyone
    return m;
  }, [scene, p.charId]);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ps = useRef(newPoseState());
  const afterPose = useRef<(() => void) | null>(null); // the officer's pistol, placed on this frame's arms
  const last = useRef({ anim: "" as string, t: 0 });

  useFrame((_, dtRaw) => {
    const g = root.current, b = body.current;
    if (!g || !b) return;
    const dt = Math.min(dtRaw, 0.05) * time.world; // slow motion (abilities, stunt jumps)
    // Far away people are simulated at a lower rate (and not drawn) to keep the frame rate up.
    const far = Math.hypot(p.x - player.pos.x, p.z - player.pos.z) > 100;
    stepPerson(p, dt);
    g.visible = !far;
    if (far) return;
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.yaw;
    // Lying down: pivot about the feet — onto the back (away from the shot) or forward onto the face, with a
    // sideways roll as they hit the ground. Knocked flying (cars, blasts): tumbling.
    const dead = p.state === "dead";
    b.rotation.x = -p.fall * (Math.PI / 2) * (dead ? p.fallDir : 1) - p.tumble;
    b.rotation.z = dead ? p.fall * p.fallSide * 0.35 : 0;
    b.position.y = p.fall * 0.12;
    const anim = animOf(p);
    if (anim !== last.current.anim) { last.current.anim = anim; last.current.t = 0; }
    last.current.t += dt;
    // Same gait model as the player: stride length grows with pace, so feet plant instead of sliding.
    const stride = THREE.MathUtils.lerp(1.45, 3.3, THREE.MathUtils.clamp((p.speed - 2.4) / 3.2, 0, 1));
    if (p.speed > 0.05) p.phase += (p.speed * dt * Math.PI * 2) / stride;
    const pose = computePose(anim, anim === "wave" || anim === "idle" ? p.life : last.current.t, p.phase, true, p.speed);
    if (p.cop && anim !== "down" && !anim.startsWith("punch")) {
      // Service pistol: held low while running, raised two-handed at the player when they open fire.
      const dy = 1.2 - 1.45, dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      weaponArms(pose.bones, "pistol", p.aiming, THREE.MathUtils.radToDeg(Math.atan2(dy, Math.max(dist, 1))));
    }
    // Gunshots: a body going down, a flinch on impact, a hand pressed to the wound while they run.
    if (dead && p.death) pose.hipsLift = dyingPose(pose.bones, p.death, p.t, p.life + p.x, p.fall);
    else if (anim !== "down") {
      pose.hipsLift += flinch(pose.bones, p.hitT, p.hitFront, p.hitSide, p.hitPart);
      if (p.wound > 0.05 && !p.cop) pose.hipsLift += clutchWound(pose.bones, p.hitPart, p.wound * 2, p.life, p.speed);
    }
    const snap = dead && p.t < 1.5 ? 16 : p.hitT < 0.1 ? 30 : 0; // fast reactions need a quick blend
    applyPose(model, pose, pose.hipsLift, ps.current, 1 - Math.exp(-dt * (snap || (anim.startsWith("punch") ? 22 : p.cop && p.aiming > 0.5 ? 16 : 9))));
    afterPose.current?.();
  });

  return (
    <>
      <group ref={root}>
        <group ref={body}>
          <group scale={model.scale}><group position-y={model.offsetY / model.scale}><primitive object={model.scene} /></group></group>
        </group>
        <Shadow size={0.9} />
      </group>
      {/* World-space (not under the body group): it is placed from the hand bone's world position. */}
      {p.cop && <Suspense fallback={null}><CopGun p={p} model={model} after={afterPose} /></Suspense>}
    </>
  );
}

/** An officer's pistol: in the right hand, pointed at the player when aiming, with a muzzle flash on each shot. */
function CopGun({ p, model, after }: { p: Person; model: CharacterModel; after: { current: (() => void) | null } }) {
  const gunModel = useWeaponModel("pistol");
  const ref = useRef<THREE.Group>(null);
  const flash = useMemo(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: "#ffd27a", toneMapped: false }));
    m.position.z = 0.2;
    return m;
  }, []);
  useEffect(() => {
    after.current = () => {
      const g = ref.current, hand = model.bones.get("RightHand")?.bone;
      if (!g || !hand) return;
      g.visible = p.state === "cop" && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 100;
      if (!g.visible) return;
      const dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      // Same hold as the player: hangs from the arm when lowered, two-handed along the aim when raised.
      if (!placeHeld(g, model.bones, p.yaw, "pistol", p.aiming, p.yaw, Math.atan2(1.2 - 1.45, Math.max(dist, 1)), 0.16)) placeInHand(g, hand, p.yaw, -1.1, 0.16);
      flash.visible = p.flash > 0;
    };
    return () => { after.current = null; };
  }, [after, model, p, flash]);
  return <group ref={ref}><primitive object={gunModel} /><primitive object={flash} /></group>;
}

/** Scott: no usable legs, so he stands by the office, looks around and waves when the player comes close. */
function Idler({ at }: { at: { x: number; z: number } }) {
  const { scene } = useGLTF(characterUrl("scott"));
  const model = useMemo(() => prepareCharacter(scene, heightOf("scott")), [scene]);
  const root = useRef<THREE.Group>(null);
  const ps = useRef(newPoseState());
  const t = useRef(0);
  const wave = useRef(0);
  useEffect(() => { crowd.set("idler", at); return () => { crowd.delete("idler"); }; }, [at]);
  useFrame((_, dtRaw) => {
    const g = root.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 0.05);
    t.current += dt;
    const dx = player.pos.x - at.x, dz = player.pos.z - at.z;
    const near = Math.hypot(dx, dz) < 3.2;
    wave.current = THREE.MathUtils.lerp(wave.current, near ? 1 : 0, 1 - Math.exp(-dt * 3));
    const want = near ? Math.atan2(dx, dz) : Math.sin(t.current * 0.25) * 0.8;
    g.rotation.y = lerpAngle(g.rotation.y, want, Math.min(1, dt * 3));
    applyPose(model, computePose(wave.current > 0.5 ? "wave" : "idle", t.current, 0, true), 0, ps.current, 1 - Math.exp(-dt * 6));
  });
  return (
    <group ref={root} position={[at.x, 0, at.z]}>
      <group scale={model.scale}><group position-y={model.offsetY / model.scale}><primitive object={model.scene} /></group></group>
    </group>
  );
}

function Statue({ at }: { at: { x: number; z: number } }) {
  const { scene } = useGLTF(characterUrl("spanner"));
  const fit = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const box = new THREE.Box3().setFromObject(o);
    const s = heightOf("spanner") / Math.max(box.max.y - box.min.y, 0.001);
    return { o, s, y: -box.min.y * s };
  }, [scene]);
  useEffect(() => { crowd.set("statue", at); return () => { crowd.delete("statue"); }; }, [at]);
  const plinth = 0.7;
  return (
    <group position={[at.x, 0, at.z]} rotation-y={-0.6}>
      <mesh position={[0, plinth / 2, 0]} castShadow receiveShadow><boxGeometry args={[1.3, plinth, 1.3]} /><meshStandardMaterial color="#3a3530" roughness={0.6} /></mesh>
      <mesh position={[0, plinth + 0.02, 0]}><boxGeometry args={[1.36, 0.04, 1.36]} /><meshStandardMaterial color="#c9a24b" metalness={0.9} roughness={0.25} /></mesh>
      <group position-y={plinth + 0.04 + fit.y} scale={fit.s}><primitive object={fit.o} /></group>
    </group>
  );
}

const HOME = { x: 6, z: 6 };
const EXTRA = 2; // repeat a few characters so the streets feel populated

/** Seeds the street population around the office once; afterwards people.ts moves them around the island. */
export function Crowd() {
  const me = useAvatarCharacter();
  const version = useGame((s) => s.peopleVersion);
  // Street population: the non-playable roster (plus a few repeats), seeded once around the office.
  useEffect(() => {
    const ids = CHARACTERS.filter((c) => c.role === "npc").map((c) => c.id);
    // Settings > Pedestrian density adds repeats of the cast.
    const extra = gfx().crowd ?? EXTRA;
    const roster = [...ids, ...Array.from({ length: extra }, (_, i) => ids[i % ids.length])];
    const added: string[] = [];
    roster.forEach((charId, i) => {
      const a = (i / roster.length) * Math.PI * 2;
      let x = HOME.x + Math.cos(a) * (8 + (i % 3) * 5), z = HOME.z + Math.sin(a) * (8 + (i % 3) * 5);
      for (let k = 0; k < 40 && !streetStand(x, z); k++) { x += Math.cos(a + k) * 1.5; z += Math.sin(a + k) * 1.5; }
      const id = `npc-${i}-${charId}`;
      addPerson(id, charId, x, z).home = { ...HOME };
      added.push(id);
    });
    return () => added.forEach(removePerson);
  }, []);
  // The playable characters you're not controlling wait where you last left them (character switching).
  useEffect(() => {
    const added: string[] = [];
    for (const charId of PLAYABLE) {
      if (charId === me.id) continue;
      const at = charSpot(charId);
      const spot = openSpot(at.x, at.z, streetStand, 0.4);
      const id = `pc-${charId}`;
      addPerson(id, charId, spot.x, spot.z, false, true).home = { ...spot };
      added.push(id);
    }
    return () => added.forEach(removePerson);
  }, [me.id]);
  // Officers appear the moment a cruiser stops: have their model and pistol ready so they never stand frozen.
  useEffect(() => { const t = setTimeout(() => { useGLTF.preload(characterUrl("cop")); useGLTF.preload(weaponModelUrl("pistol"), DRACO_PATH); }, 4000); return () => clearTimeout(t); }, []);
  const ids = useMemo(() => [...people.keys()], [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const idleAt = useMemo(() => ({ x: 5.5, z: -4 }), []);
  const statueAt = useMemo(() => ({ x: 30, z: -17 }), []);
  return (
    <group>
      {ids.map((id) => <Optional key={id}><Pedestrian id={id} /></Optional>)}
      <Optional><Idler at={idleAt} /></Optional>
      <Optional><Statue at={statueAt} /></Optional>
    </group>
  );
}

class OptionalBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error("[assets] NPC failed to load", err instanceof Error ? err.message : err); }
  render() { return this.state.failed ? null : this.props.children; }
}
const Optional = ({ children }: { children: ReactNode }) => (
  <OptionalBoundary><Suspense fallback={null}>{children}</Suspense></OptionalBoundary>
);
