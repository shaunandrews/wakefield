// The VR room: a round table, the shared screen floating across it, a seat for
// every player, your console at the table's edge, and a d20 you grab and throw.
// Plain three.js, driven by the same live queries as the phone and table screens.
import { abilitiesFor, findSkill } from "../../shared/content";
import { checkModifier, type CheckResult } from "../../shared/rules";
import type { LogView, PlayerView, SeatView, TableView } from "../../shared/views";
import { COLOR, MOTION } from "../design";
import { Panel, type Three } from "./panel";

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

/**
 * three.js is ~600 KB, so only the VR route pays for it. Zero bundles don't
 * allow dynamic imports, so a module script loads it and hands it over.
 */
export function loadThree(): Promise<Three> {
  const w = window as Window & { __wfThree?: Three };
  if (w.__wfThree) return Promise.resolve(w.__wfThree);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("three.js took too long to load")), 20000);
    window.addEventListener(
      "wf-three",
      () => {
        clearTimeout(timer);
        resolve(w.__wfThree);
      },
      { once: true },
    );
    const s = document.createElement("script");
    s.type = "module";
    s.textContent = `import * as T from "${THREE_URL}"; window.__wfThree = T; window.dispatchEvent(new Event("wf-three"));`;
    s.onerror = () => reject(new Error("three.js failed to load"));
    document.head.append(s);
  });
}

export type VrState = {
  table: TableView;
  player: PlayerView;
  ability: string;
  thinking: boolean;
  error: string;
  /** Set when you're watching bots play (you host, you aren't seated). */
  sim: { feed: string[]; paused: boolean } | null;
};

export type VrActions = {
  choose: (optionIndex: number) => void;
  help: (characterId: string) => void;
  hold: () => void;
  change: () => void;
  toggleAbility: (name: string) => void;
  begin: () => void;
  roll: () => Promise<CheckResult | null>;
  pause: () => void;
  newSim: () => void;
};

// Room layout, in meters. You always sit at +z, facing the screen at -z.
const TABLE_Y = 0.74;
const TABLE_R = 0.8;
const SEAT_R = 1.45;
const EYE = 1.2;
const DIE_R = 0.055;
const DIE_HOME = { x: 0, z: 0.42 };

const OUTCOME: Record<string, { color: string; meaning: string }> = {
  surge: { color: COLOR.signal, meaning: "Better than hoped." },
  success: { color: COLOR.signal, meaning: "You do it." },
  mixed: { color: COLOR.caution, meaning: "You do it, at a cost." },
  miss: { color: COLOR.alarm, meaning: "It doesn't work." },
  glitch: { color: COLOR.alarm, meaning: "It goes wrong." },
};

const hex = (c: string) => parseInt(c.slice(1), 16);

// ---------------------------------------------------------------------------
// Dice: a wireframe icosahedron with just enough physics to feel thrown.

type DieState = "hidden" | "idle" | "held" | "flying" | "rest";

class Die {
  group: Three;
  body: Three;
  edges: Three;
  label: Three;
  labelCanvas = document.createElement("canvas");
  p: Three;
  v: Three;
  w: Three;
  state: DieState = "hidden";
  result: CheckResult | null = null;
  flightStart = 0;
  restAt = 0;
  history: { t: number; p: Three }[] = [];

  constructor(
    private T: Three,
    color: string,
  ) {
    this.group = new T.Group();
    const geo = new T.IcosahedronGeometry(DIE_R, 0);
    this.body = new T.Mesh(geo, new T.MeshBasicMaterial({ color: hex(COLOR.surface) }));
    this.edges = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: hex(color), transparent: true }));
    this.body.add(this.edges);
    this.group.add(this.body);
    this.labelCanvas.width = 512;
    this.labelCanvas.height = 320;
    const tex = new T.CanvasTexture(this.labelCanvas);
    tex.colorSpace = T.SRGBColorSpace;
    this.label = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    this.label.scale.set(0.26, 0.1625, 1);
    this.label.visible = false;
    this.group.add(this.label);
    this.p = new T.Vector3();
    this.v = new T.Vector3();
    this.w = new T.Vector3();
    this.group.visible = false;
  }

  place(x: number, z: number) {
    this.p.set(x, TABLE_Y + DIE_R, z);
    this.v.set(0, 0, 0);
    this.w.set(0, 0, 0);
    this.result = null;
    this.label.visible = false;
    this.state = "idle";
    this.group.visible = true;
  }

  hide() {
    this.state = "hidden";
    this.group.visible = false;
    this.label.visible = false;
  }

  throw(v: Three) {
    this.v.copy(v);
    this.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    this.state = "flying";
    this.flightStart = performance.now();
  }

  showResult(r: CheckResult, who = "") {
    this.result = r;
    const ctx = this.labelCanvas.getContext("2d")!;
    const o = OUTCOME[r.outcome] ?? OUTCOME.success;
    ctx.clearRect(0, 0, 512, 320);
    ctx.textAlign = "center";
    ctx.fillStyle = o.color;
    ctx.font = `700 180px "JetBrains Mono", monospace`;
    ctx.fillText(String(r.kept), 256, 190);
    ctx.font = `500 48px "JetBrains Mono", monospace`;
    ctx.fillText(r.outcome.toUpperCase(), 256, 262);
    if (who) {
      ctx.fillStyle = COLOR.muted;
      ctx.font = `500 34px "JetBrains Mono", monospace`;
      ctx.fillText(who.toUpperCase(), 256, 310);
    }
    this.label.material.map.needsUpdate = true;
  }

  step(dt: number, t: number) {
    if (this.state === "hidden") return;
    if (this.state === "idle") {
      // Waiting for you: hover and pulse.
      this.group.position.set(this.p.x, this.p.y + 0.02 + Math.sin(t * 3) * 0.01, this.p.z);
      this.body.rotation.y += dt * 0.8;
      this.edges.material.opacity = 0.6 + Math.sin(t * 5) * 0.4;
      return;
    }
    this.edges.material.opacity = 1;
    if (this.state === "flying") {
      this.v.y -= 9.8 * dt;
      this.p.addScaledVector(this.v, dt);
      const floor = TABLE_Y + DIE_R;
      if (this.p.y < floor) {
        this.p.y = floor;
        if (this.v.y < 0) this.v.y = -this.v.y * 0.35;
        this.v.x *= 0.72;
        this.v.z *= 0.72;
        this.w.multiplyScalar(0.7);
      }
      // The rim keeps dice on the table.
      const r = Math.hypot(this.p.x, this.p.z);
      const max = TABLE_R - DIE_R - 0.02;
      if (r > max) {
        const nx = this.p.x / r;
        const nz = this.p.z / r;
        this.p.x = nx * max;
        this.p.z = nz * max;
        const out = this.v.x * nx + this.v.z * nz;
        if (out > 0) {
          this.v.x -= 1.5 * out * nx;
          this.v.z -= 1.5 * out * nz;
        }
      }
      const angle = this.w.length() * dt;
      if (angle > 0) this.body.rotateOnWorldAxis(this.w.clone().normalize(), angle);
      const settled = this.p.y <= floor + 0.002 && this.v.length() < 0.06;
      if (settled || performance.now() - this.flightStart > 3500) {
        this.state = "rest";
        this.restAt = performance.now();
      }
    }
    this.group.position.copy(this.p);
    this.label.position.set(0, 0.16, 0);
    this.label.visible = this.state === "rest" && Boolean(this.result);
  }
}

// ---------------------------------------------------------------------------
// Other players: a floating marker and a name card at their seat.

type Avatar = { group: Three; head: Three; card: Panel; ring: Three; angle: number; seat: SeatView; die: Die };

// ---------------------------------------------------------------------------

export class Room {
  private renderer: Three;
  private scene: Three;
  private camera: Three;
  private rig: Three;
  private screen: Panel;
  private console: Panel;
  private tabletop: Panel;
  private tabletopGroup: Three;
  private myDie: Die;
  private avatars = new Map<string, Avatar>();
  private state: VrState | null = null;
  private seenRolls = new Set<string>();
  private firstState = true;
  private moment: { log: LogView; until: number } | null = null;
  private raycaster: Three;
  private mouse: Three;
  private yaw = 0;
  private pitch = -0.22;
  private drag: { kind: "look" | "die" | "press"; x: number; y: number; region?: string } | null = null;
  private controllers: { ctrl: Three; ray: Three; grab: { dist: number } | null; pressed: string }[] = [];
  private rolling = false;
  private disposed = false;
  private clock: Three;

  constructor(
    private T: Three,
    private container: HTMLElement,
    private actions: VrActions,
  ) {
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local-floor");
    container.append(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    this.renderer = renderer;
    this.clock = new T.Clock();

    const scene = new T.Scene();
    scene.background = new T.Color(hex(COLOR.canvas));
    scene.fog = new T.Fog(hex(COLOR.canvas), 4, 13);
    this.scene = scene;

    this.camera = new T.PerspectiveCamera(76, container.clientWidth / container.clientHeight, 0.03, 60);
    this.rig = new T.Group();
    this.rig.position.set(0, 0, SEAT_R);
    this.rig.add(this.camera);
    this.camera.position.set(0, EYE, 0);
    this.camera.rotation.order = "YXZ";
    scene.add(this.rig);

    this.buildRoom();

    this.screen = new Panel(T, 1.92, 1.08, 1066);
    this.screen.mesh.position.set(0, 1.78, -1.55);
    this.screen.mesh.rotation.x = 0.06;
    scene.add(this.screen.mesh);
    this.addFrame(this.screen.mesh, 1.92, 1.08);

    this.console = new Panel(T, 0.8, 0.52, 1900);
    this.console.mesh.scale.setScalar(0.72);
    this.console.mesh.position.set(0, 0.84, 0.74);
    this.console.mesh.rotation.x = -0.95;
    scene.add(this.console.mesh);

    this.tabletop = new Panel(T, 0.9, 0.9, 900);
    this.tabletop.mesh.rotation.x = -Math.PI / 2;
    this.tabletop.mesh.material.depthWrite = false;
    this.tabletopGroup = new T.Group();
    this.tabletopGroup.position.set(0, TABLE_Y + 0.002, -0.05);
    this.tabletopGroup.add(this.tabletop.mesh);
    scene.add(this.tabletopGroup);

    this.myDie = new Die(T, COLOR.signal);
    scene.add(this.myDie.group);

    this.raycaster = new T.Raycaster();
    this.mouse = new T.Vector2();
    this.setupControllers();
    this.setupPointer();
    window.addEventListener("resize", this.onResize);
    renderer.xr.addEventListener("sessionstart", () => {
      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
    });
    renderer.xr.addEventListener("sessionend", () => this.camera.position.set(0, EYE, 0));
    renderer.setAnimationLoop(this.tick);
  }

  dispose() {
    this.disposed = true;
    // Leaving the page mid-session must end VR cleanly, or the headset drops to a frozen frame.
    this.renderer.xr.getSession()?.end().catch(() => undefined);
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  async enterVR() {
    const xr = (navigator as Navigator & { xr?: { requestSession: (m: string, o: object) => Promise<unknown> } }).xr;
    if (!xr) return;
    const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"] });
    await this.renderer.xr.setSession(session);
  }

  // -------------------------------------------------------------------------
  // State in

  update(state: VrState) {
    const prev = this.state;
    this.state = state;
    this.syncAvatars();
    this.syncRolls();
    this.syncMyDie();
    this.screen.dirty = true;
    this.console.dirty = true;
    this.tabletop.dirty = true;
    if (prev?.table.campaign.beat !== state.table.campaign.beat) this.console.setHover("");
  }

  /** For bots and tests: throw your die without a hand. */
  autoThrow() {
    if (this.myDie.state !== "idle") return false;
    this.release(new this.T.Vector3(0, 0, 0));
    return true;
  }

  get dieReady() {
    return this.myDie.state === "idle";
  }

  private me(): SeatView | null {
    return this.state?.player.seat ?? null;
  }

  private syncAvatars() {
    const s = this.state!;
    const seats = s.table.seats;
    const myId = this.me()?.character.id;
    const mineAt = seats.findIndex((x) => x.character.id === myId);
    const others = seats.filter((x) => x.character.id !== myId);
    const keep = new Set<string>();
    // Watching: you take an extra, empty seat, so nobody sits in your lap.
    const n = mineAt === -1 ? seats.length + 1 : seats.length;
    others.forEach((seat) => {
      const idx = seats.indexOf(seat);
      const k = mineAt === -1 ? idx + 1 : (idx - mineAt + n) % n;
      const angle = (k / n) * Math.PI * 2;
      keep.add(seat.character.id);
      let a = this.avatars.get(seat.character.id);
      if (!a) {
        a = this.makeAvatar(seat, angle);
        this.avatars.set(seat.character.id, a);
      }
      a.seat = seat;
      a.angle = angle;
      a.group.position.set(Math.sin(angle) * SEAT_R, 0, Math.cos(angle) * SEAT_R);
      a.card.dirty = true;
    });
    for (const [id, a] of this.avatars) {
      if (!keep.has(id)) {
        this.scene.remove(a.group, a.die.group);
        this.avatars.delete(id);
      }
    }
  }

  /** New dice from anyone: a moment on the screen, and other players' dice land on the table. */
  private syncRolls() {
    const s = this.state!;
    const rolls = s.table.log.filter((l) => l.kind === "roll" && l.roll);
    const myId = this.me()?.character.id;
    for (const l of rolls) {
      if (this.seenRolls.has(l.id)) continue;
      this.seenRolls.add(l.id);
      if (this.firstState) continue;
      this.moment = { log: l, until: performance.now() + MOTION.diceHoldMs };
      const a = this.avatars.get(l.characterId);
      if (a && l.characterId !== myId && l.roll) {
        const sx = Math.sin(a.angle) * (TABLE_R - 0.15);
        const sz = Math.cos(a.angle) * (TABLE_R - 0.15);
        a.die.place(sx, sz);
        a.die.p.y += 0.25;
        a.die.throw(new this.T.Vector3(-sx * 1.2 + (Math.random() - 0.5) * 0.4, 1.0, -sz * 1.2 + (Math.random() - 0.5) * 0.4));
        a.die.showResult(l.roll, l.who);
      }
    }
    this.firstState = false;
  }

  private syncMyDie() {
    const seat = this.me();
    const phase = this.state!.table.campaign.phase;
    const owed = phase === "rolls" && seat?.check && !seat.check.rolled;
    if (owed && this.myDie.state === "hidden" && !this.rolling) this.myDie.place(DIE_HOME.x, DIE_HOME.z);
    if (!owed && this.myDie.state === "idle") this.myDie.hide();
    if (this.myDie.state === "rest" && phase !== "rolls" && performance.now() - this.myDie.restAt > 2500) this.myDie.hide();
  }

  // -------------------------------------------------------------------------
  // Building the room

  private buildRoom() {
    const T = this.T;
    const scene = this.scene;
    const grid = new T.GridHelper(26, 52, hex(COLOR.line), hex(COLOR.line));
    grid.material.transparent = true;
    grid.material.opacity = 0.7;
    scene.add(grid);

    const circle = (r: number, color: string, opacity: number, y: number) => {
      const pts = [];
      for (let i = 0; i <= 128; i++) pts.push(new T.Vector3(Math.cos((i / 128) * Math.PI * 2) * r, y, Math.sin((i / 128) * Math.PI * 2) * r));
      const line = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: hex(color), transparent: true, opacity }));
      scene.add(line);
      return line;
    };

    // Table: dark disc, signal rim, faint inner rings, wire pedestal.
    const top = new T.Mesh(new T.CylinderGeometry(TABLE_R, TABLE_R, 0.03, 96), new T.MeshBasicMaterial({ color: hex(COLOR.surface) }));
    top.position.y = TABLE_Y - 0.015;
    scene.add(top);
    circle(TABLE_R, COLOR.signal, 0.9, TABLE_Y + 0.001);
    circle(TABLE_R - 0.06, COLOR.line, 1, TABLE_Y + 0.001);
    const ped = new T.CylinderGeometry(0.07, 0.28, TABLE_Y - 0.03, 24, 1, true);
    const pedLines = new T.LineSegments(new T.EdgesGeometry(ped), new T.LineBasicMaterial({ color: hex(COLOR.line) }));
    pedLines.position.y = (TABLE_Y - 0.03) / 2;
    scene.add(pedLines);

    // The circle of seats on the floor.
    circle(SEAT_R + 0.35, COLOR.signal, 0.12, 0.002);
    const myRing = circle(0.22, COLOR.signal, 0.5, 0.003);
    myRing.position.set(0, 0, SEAT_R);
  }

  private addFrame(mesh: Three, w: number, h: number) {
    const T = this.T;
    const t = 0.06;
    const hw = w / 2;
    const hh = h / 2;
    const pts = [
      [-hw, hh - t, -hw, hh, -hw + t, hh],
      [hw - t, -hh, hw, -hh, hw, -hh + t],
    ];
    for (const p of pts) {
      const g = new T.BufferGeometry().setFromPoints([new T.Vector3(p[0], p[1], 0.002), new T.Vector3(p[2], p[3], 0.002), new T.Vector3(p[4], p[5], 0.002)]);
      mesh.add(new T.Line(g, new T.LineBasicMaterial({ color: hex(COLOR.signal) })));
    }
  }

  private makeAvatar(seat: SeatView, angle: number): Avatar {
    const T = this.T;
    const group = new T.Group();
    const geo = new T.OctahedronGeometry(0.08, 0);
    const head = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: hex(COLOR.muted) }));
    head.position.y = 1.2;
    group.add(head);
    const stem = new T.Line(
      new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 1.08, 0)]),
      new T.LineBasicMaterial({ color: hex(COLOR.line) }),
    );
    group.add(stem);
    const pts = [];
    for (let i = 0; i <= 64; i++) pts.push(new T.Vector3(Math.cos((i / 64) * Math.PI * 2) * 0.22, 0.003, Math.sin((i / 64) * Math.PI * 2) * 0.22));
    const ring = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: hex(COLOR.muted), transparent: true, opacity: 0.6 }));
    group.add(ring);
    const card = new Panel(T, 0.44, 0.27, 1300);
    card.mesh.scale.setScalar(1.25);
    card.mesh.position.y = 0.94;
    group.add(card.mesh);
    this.scene.add(group);
    const die = new Die(T, COLOR.muted);
    this.scene.add(die.group);
    return { group, head, card, ring, angle, seat, die };
  }

  // -------------------------------------------------------------------------
  // Input: mouse on desktop, controllers / hands / gaze-and-pinch in a headset.

  private setupPointer() {
    const el = this.renderer.domElement as HTMLCanvasElement;
    const toNdc = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.mouse, this.camera);
    };
    el.addEventListener("pointerdown", (e) => {
      toNdc(e);
      el.setPointerCapture(e.pointerId);
      const hit = this.pick();
      if (hit?.kind === "die") {
        this.drag = { kind: "die", x: e.clientX, y: e.clientY };
        this.grab();
      } else if (hit?.kind === "region") {
        this.drag = { kind: "press", x: e.clientX, y: e.clientY, region: hit.id };
      } else {
        this.drag = { kind: "look", x: e.clientX, y: e.clientY };
      }
    });
    el.addEventListener("pointermove", (e) => {
      toNdc(e);
      // A drag that starts on a button looks around instead of pressing it.
      if (this.drag?.kind === "press" && Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 10) {
        this.drag = { kind: "look", x: e.clientX, y: e.clientY };
      }
      if (this.drag?.kind === "look") {
        this.yaw = Math.max(-1.6, Math.min(1.6, this.yaw + (e.clientX - this.drag.x) * 0.004));
        this.pitch = Math.max(-1.1, Math.min(0.7, this.pitch + (e.clientY - this.drag.y) * 0.004));
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        return;
      }
      if (this.drag?.kind === "die") {
        const plane = new this.T.Plane(new this.T.Vector3(0, 1, 0), -(TABLE_Y + 0.14));
        const at = new this.T.Vector3();
        if (this.raycaster.ray.intersectPlane(plane, at)) this.holdAt(at);
        return;
      }
      const hit = this.pick();
      this.console.setHover(hit?.kind === "region" ? hit.id : "");
      el.style.cursor = hit ? "pointer" : this.drag ? "grabbing" : "grab";
    });
    el.addEventListener("pointerup", (e) => {
      toNdc(e);
      const d = this.drag;
      this.drag = null;
      if (d?.kind === "die") this.release(this.throwVelocity());
      if (d?.kind === "press") {
        const hit = this.pick();
        if (hit?.kind === "region" && hit.id === d.region) hit.region.onSelect();
      }
    });
  }

  private setupControllers() {
    const T = this.T;
    for (let i = 0; i < 2; i++) {
      const ctrl = this.renderer.xr.getController(i);
      const ray = new T.Line(
        new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 0, -1)]),
        new T.LineBasicMaterial({ color: hex(COLOR.signal), transparent: true, opacity: 0.6 }),
      );
      ray.scale.z = 3;
      ctrl.add(ray);
      this.rig.add(ctrl);
      const entry = { ctrl, ray, grab: null as { dist: number } | null, pressed: "" };
      this.controllers.push(entry);
      ctrl.addEventListener("selectstart", () => {
        this.aimFrom(ctrl);
        const hit = this.pick();
        if (hit?.kind === "die") {
          entry.grab = { dist: hit.distance };
          this.grab();
        } else if (hit?.kind === "region") entry.pressed = hit.id;
      });
      ctrl.addEventListener("selectend", () => {
        if (entry.grab) {
          entry.grab = null;
          this.release(this.throwVelocity());
          return;
        }
        this.aimFrom(ctrl);
        const hit = this.pick();
        if (hit?.kind === "region" && hit.id === entry.pressed) hit.region.onSelect();
        entry.pressed = "";
      });
    }
  }

  private aimFrom(ctrl: Three) {
    const m = new this.T.Matrix4().identity().extractRotation(ctrl.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m);
  }

  private pick():
    | { kind: "die"; distance: number }
    | { kind: "region"; id: string; region: { onSelect: () => void }; distance: number }
    | null {
    const targets = [this.console.mesh];
    if (this.myDie.state === "idle") targets.push(this.myDie.body);
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const h of hits) {
      if (h.object === this.myDie.body) return { kind: "die", distance: h.distance };
      if (h.object === this.console.mesh && h.uv) {
        const region = this.console.hit(h.uv);
        if (region) return { kind: "region", id: region.id, region, distance: h.distance };
        return null;
      }
    }
    // Generous grab: anywhere near the waiting die counts.
    if (this.myDie.state === "idle") {
      const d = this.raycaster.ray.distanceToPoint(this.myDie.p);
      if (d < 0.09) return { kind: "die", distance: this.raycaster.ray.origin.distanceTo(this.myDie.p) };
    }
    return null;
  }

  private grab() {
    this.myDie.state = "held";
    this.myDie.history = [];
  }

  private holdAt(p: Three) {
    this.myDie.p.copy(p);
    this.myDie.history.push({ t: performance.now(), p: p.clone() });
    if (this.myDie.history.length > 12) this.myDie.history.shift();
  }

  private throwVelocity(): Three {
    const h = this.myDie.history;
    const now = performance.now();
    const recent = h.filter((x) => now - x.t < 120);
    if (recent.length < 2) return new this.T.Vector3(0, 0, 0);
    const a = recent[0];
    const b = recent[recent.length - 1];
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    return b.p.clone().sub(a.p).divideScalar(dt);
  }

  /** Let go: the die flies, and the server rolls the real number. */
  private release(v: Three) {
    const T = this.T;
    const die = this.myDie;
    if (v.length() < 0.4) {
      // A tap or a limp drop: toss it toward the middle for you.
      const toCenter = new T.Vector3(-die.p.x, 0, -die.p.z).normalize().multiplyScalar(1.1);
      v = new T.Vector3(toCenter.x + (Math.random() - 0.5) * 0.4, 1.5, toCenter.z);
      if (die.p.y < TABLE_Y + 0.1) die.p.y = TABLE_Y + 0.12;
    }
    if (v.length() > 4) v.setLength(4);
    v.y = Math.max(v.y, 0.9);
    die.throw(v);
    this.rolling = true;
    this.actions
      .roll()
      .then((r) => {
        if (r) die.showResult(r);
        else die.hide();
      })
      .catch(() => die.hide())
      .finally(() => {
        this.rolling = false;
      });
  }

  // -------------------------------------------------------------------------
  // Frame loop

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private tick = () => {
    if (this.disposed) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const inXR = this.renderer.xr.isPresenting;

    if (!inXR) this.camera.rotation.set(this.pitch, this.yaw, 0);

    // Controllers: hover, rays, and the die in hand.
    if (inXR) {
      let hover = "";
      for (const c of this.controllers) {
        this.aimFrom(c.ctrl);
        if (c.grab) {
          const at = this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, c.grab.dist);
          this.holdAt(at);
          c.ray.scale.z = c.grab.dist;
          continue;
        }
        const hit = this.pick();
        if (hit?.kind === "region") hover = hit.id;
        c.ray.scale.z = hit ? hit.distance : 3;
      }
      this.console.setHover(hover);
    }

    this.myDie.step(dt, t);
    if (this.state) this.syncMyDie();

    const eye = new this.T.Vector3();
    this.camera.getWorldPosition(eye);
    for (const a of this.avatars.values()) {
      a.head.rotation.y += dt * 0.6;
      a.head.position.y = 1.2 + Math.sin(t * 1.4 + a.angle * 3) * 0.015;
      a.card.mesh.lookAt(eye);
      a.card.mesh.rotation.z = 0;
      const color = hex(this.avatarColor(a.seat));
      a.head.material.color.setHex(color);
      a.ring.material.color.setHex(color);
      a.die.step(dt, t);
      if (a.die.state === "rest" && performance.now() - a.die.restAt > 5000) a.die.hide();
      if (a.card.dirty) this.drawCard(a);
    }

    this.tabletopGroup.rotation.y += dt * 0.05;
    if (this.moment && performance.now() > this.moment.until) {
      this.moment = null;
      this.screen.dirty = true;
    }
    if (this.state) {
      if (this.screen.dirty) this.drawScreen();
      if (this.console.dirty) this.drawConsole();
      if (this.tabletop.dirty) this.drawTabletop();
    }
    this.renderer.render(this.scene, this.camera);
  };

  private avatarColor(seat: SeatView): string {
    const phase = this.state?.table.campaign.phase;
    if (seat.character.vigor === 0) return COLOR.alarm;
    if (phase === "rolls" && seat.check && !seat.check.rolled) return COLOR.caution;
    if (phase === "actions" && seat.ready) return COLOR.signal;
    return COLOR.muted;
  }

  // -------------------------------------------------------------------------
  // Drawing: the shared screen (the table's iPad, in the room)

  private drawScreen() {
    const p = this.screen;
    const { campaign, seats, log } = this.state!.table;
    const M = 80;
    p.begin();
    p.ctx.globalAlpha = 1;

    if (campaign.phase === "lobby") {
      p.text("WAKEFIELD", M, 120, { size: 40, tracking: 0.3, weight: 500 });
      p.text(campaign.adventureTitle, M, 300, { size: 36, upper: true, tracking: 0.2, color: COLOR.muted });
      p.para(campaign.name, M, 400, 1100, { size: 92, maxLines: 2, lineHeight: 100 });
      p.text("Join on a phone or headset", M, 650, { size: 30, upper: true, tracking: 0.2, color: COLOR.muted });
      p.text("wakefield.space.fast/join", M, 720, { size: 50 });
      p.text(campaign.code, M - 8, 960, { size: 240, weight: 700, tracking: 0.3, color: COLOR.signal });
      p.text("At the table", 1360, 300, { size: 30, upper: true, tracking: 0.2, color: COLOR.muted });
      seats.forEach((s, i) => p.text(s.character.name, 1360, 380 + i * 76, { size: 48 }));
      if (!seats.length) p.text("Nobody yet", 1360, 380, { size: 40, color: COLOR.muted, read: true });
      return p.end();
    }

    if (campaign.phase === "ended") {
      p.text(campaign.adventureTitle, M, 140, { size: 34, upper: true, tracking: 0.3, color: COLOR.muted });
      p.text("THE END", M, 300, { size: 140, tracking: 0.12 });
      const story = campaign.summary ? campaign.summary.split(/\n+/).filter(Boolean) : log.filter((l) => l.kind === "narration").slice(-1).map((l) => l.text);
      let y = 420;
      for (const para of story.slice(-4)) y = p.para(para, M, y, p.w - M * 2, { size: 38, read: true, color: COLOR.muted, lineHeight: 54, maxLines: 4 }) + 24;
      return p.end();
    }

    // Header
    p.text(campaign.sceneTitle, M, 96, { size: 34, upper: true, tracking: 0.2, color: COLOR.signal });
    if (campaign.mode === "combat") p.text("· fight", M + p.ctx.measureText(campaign.sceneTitle.toUpperCase()).width + 24, 96, { size: 34, upper: true, tracking: 0.2, color: COLOR.alarm });
    p.text(campaign.code, p.w - M, 96, { size: 34, tracking: 0.4, color: COLOR.muted, align: "right" });
    p.line(0, 136, p.w, 136);

    // Story, newest at the bottom.
    const entries = log.filter((l) => !l.private && l.kind !== "whisper").slice(-14);
    type Block = { lines: string[]; size: number; lh: number; color: string; read: boolean; upper?: boolean; gap: number };
    const blocks: Block[] = entries.map((l) => {
      const width = p.w - M * 2;
      if (l.kind === "narration") return { lines: p.wrap(l.text, width, { size: 44, read: true }), size: 44, lh: 62, color: COLOR.ink, read: true, gap: 30 };
      if (l.kind === "scene") return { lines: [l.text.toUpperCase()], size: 30, lh: 40, color: COLOR.signal, read: false, gap: 30 };
      if (l.kind === "roll" && l.roll) {
        const o = OUTCOME[l.roll.outcome] ?? OUTCOME.success;
        return { lines: [`${l.who} rolls ${l.roll.kept} · ${l.roll.outcome}`.toUpperCase()], size: 28, lh: 40, color: o.color, read: false, gap: 14 };
      }
      if (l.kind === "effect") return { lines: p.wrap(l.text, width, { size: 30 }), size: 30, lh: 42, color: COLOR.caution, read: false, gap: 14 };
      const text = l.who ? `${l.who} · ${l.text}` : l.text;
      return { lines: p.wrap(text, width, { size: 30 }), size: 30, lh: 42, color: COLOR.muted, read: false, gap: 14 };
    });
    let y = 880;
    const top = 190;
    for (let i = blocks.length - 1; i >= 0 && y > top; i--) {
      const b = blocks[i];
      const fade = i === blocks.length - 1 || (i === blocks.length - 2 && b.read) ? 1 : 0.55;
      for (let j = b.lines.length - 1; j >= 0 && y > top; j--) {
        p.ctx.globalAlpha = fade;
        p.text(b.lines[j], M, y, { size: b.size, read: b.read, color: b.color, tracking: b.read ? 0 : 0.08 });
        y -= b.lh;
      }
      y -= b.gap;
    }
    p.ctx.globalAlpha = 1;
    // Fade the top edge into the void.
    const g = p.ctx.createLinearGradient(0, 140, 0, 260);
    g.addColorStop(0, COLOR.canvas);
    g.addColorStop(1, "rgba(5,6,7,0)");
    p.ctx.fillStyle = g;
    p.ctx.fillRect(0, 138, p.w, 122);

    // Footer: what the room is waiting for.
    p.line(0, 920, p.w, 920);
    if (this.state!.thinking || campaign.gmBusy || campaign.phase === "outcome") {
      p.text("The story unfolds_", M, 1030, { size: 52, color: COLOR.signal });
    } else if (campaign.phase === "rolls") {
      const waiting = seats.filter((s) => s.check && !s.check.rolled).map((s) => s.character.name);
      p.text("Roll your dice", M, 1010, { size: 52 });
      p.text(waiting.length ? `Waiting on ${waiting.join(", ")}` : "All rolled.", M, 1072, { size: 32, color: COLOR.muted });
    } else {
      const waiting = seats.filter((s) => !s.ready).map((s) => s.character.name);
      p.para(campaign.prompt, M, 1000, p.w - M * 2, { size: 46, read: true, maxLines: 1 });
      p.text(waiting.length ? `Waiting on ${waiting.join(", ")}` : "Everyone's in.", M, 1072, { size: 32, color: COLOR.muted });
    }

    // Dice moment, like the iPad's.
    if (this.moment?.log.roll) {
      const r = this.moment.log.roll;
      const o = OUTCOME[r.outcome] ?? OUTCOME.success;
      const bw = 860;
      const bh = 600;
      const bx = (p.w - bw) / 2;
      const by = (p.h - bh) / 2 - 20;
      p.fill(bx, by, bw, bh, COLOR.canvas);
      p.frame(bx, by, bw, bh, 36);
      const cx = p.w / 2;
      p.text(`${this.moment.log.who} · ${findSkill(r.skill)?.name ?? r.skill}`, cx, by + 90, { size: 32, upper: true, tracking: 0.15, align: "center" });
      p.text(String(r.kept), cx, by + 360, { size: 240, weight: 700, color: o.color, align: "center" });
      p.text(r.outcome, cx, by + 450, { size: 56, upper: true, tracking: 0.3, color: o.color, align: "center" });
      p.text(o.meaning, cx, by + 530, { size: 38, read: true, color: COLOR.muted, align: "center" });
    }
    p.end();
  }

  // -------------------------------------------------------------------------
  // Drawing: your console (the phone, in the room)

  private drawConsole() {
    this.drawConsoleBody();
    const err = this.state!.error;
    if (!err) return;
    const p = this.console;
    p.fill(0, p.h - 70, p.w, 70, COLOR.canvas);
    p.line(0, p.h - 70, p.w, p.h - 70, COLOR.alarm, 2);
    p.para(err, 56, p.h - 24, p.w - 112, { size: 28, color: COLOR.alarm, maxLines: 1 });
    p.end();
  }

  private drawConsoleBody() {
    const p = this.console;
    const { player, ability } = this.state!;
    const { campaign } = player;
    const seat = player.seat;
    const M = 56;
    const W = p.w - M * 2;
    p.begin(COLOR.canvas);
    p.frame(2, 2, p.w - 4, p.h - 4, 40);

    if (!seat) {
      if (this.state!.sim) return this.drawSimConsole();
      p.text("You're watching.", M, 140, { size: 56 });
      p.para("Join this table on the 2D page first, then come back to sit down.", M, 230, W, { size: 36, read: true, color: COLOR.muted });
      return p.end();
    }
    const c = seat.character;

    // Header: who you are.
    p.text(c.name, M, 104, { size: 52 });
    p.text("Charge", p.w - M - 30 * c.sheet.chargeMax - 24, 98, { size: 24, upper: true, tracking: 0.2, color: COLOR.muted, align: "right" });
    for (let i = 0; i < c.sheet.chargeMax; i++) p.fill(p.w - M - 30 * (c.sheet.chargeMax - i) + 6, 76, 22, 22, i < c.charge ? COLOR.signal : COLOR.line);
    p.meter(M, 132, W - 120, 14, c.vigor, c.sheet.vigorMax, c.vigor === 0 ? COLOR.alarm : c.vigor <= c.sheet.vigorMax / 3 ? COLOR.caution : COLOR.signal);
    p.text(`${c.vigor}/${c.sheet.vigorMax}`, p.w - M, 148, { size: 26, color: COLOR.muted, align: "right" });
    p.line(M, 186, p.w - M, 186);
    let y = 250;

    const status = (big: string, small: string, color: string = COLOR.ink) => {
      p.para(big, M, y + 40, W, { size: 52, color, read: true, lineHeight: 64, maxLines: 3 });
      p.para(small, M, y + 160, W, { size: 34, read: true, color: COLOR.muted, maxLines: 3 });
    };

    if (campaign.phase === "lobby") {
      if (campaign.isHost) {
        status("You're hosting.", this.state!.table.seats.length ? "Begin when everyone's seated." : "Waiting for someone to sit down.");
        const ok = this.state!.table.seats.length > 0;
        p.button("begin", M, 640, W, 140, (hot) => p.text("Begin the adventure", p.w / 2, 728, { size: 44, upper: true, tracking: 0.1, align: "center", color: hot ? COLOR.canvas : COLOR.signal }), this.actions.begin, ok);
      } else status("You're in.", "The game starts when the table begins_");
      return p.end();
    }

    if (campaign.phase === "ended") {
      status("The end.", `${c.name} has ${c.xp} XP. Thanks for playing ${campaign.adventureTitle}.`);
      return p.end();
    }

    if (campaign.gmBusy || campaign.phase === "outcome" || this.state!.thinking) {
      status("Look up.", "The story's on the screen_", COLOR.signal);
      return p.end();
    }

    if (campaign.phase === "rolls") {
      const check = seat.check;
      if (!check) {
        status("The others are rolling.", "Watch the table.");
        return p.end();
      }
      if (check.result) {
        const o = OUTCOME[check.result.outcome] ?? OUTCOME.success;
        p.text(check.result.outcome, p.w / 2, y + 120, { size: 110, upper: true, tracking: 0.25, color: o.color, align: "center", weight: 500 });
        p.text(o.meaning, p.w / 2, y + 210, { size: 40, read: true, align: "center" });
        p.text(`You rolled ${check.result.kept}${check.result.modifier ? `, ${check.result.modifier > 0 ? "+" : "−"}${Math.abs(check.result.modifier)}` : ""}`, p.w / 2, y + 280, { size: 30, color: COLOR.muted, align: "center" });
        p.text("Look up. The story's on the screen.", p.w / 2, y + 420, { size: 32, color: COLOR.muted, align: "center", read: true });
        return p.end();
      }
      const skill = findSkill(check.skill);
      const mod = checkModifier(c.sheet, check.skill as never);
      y = p.para(check.reason, M, y + 20, W, { size: 44, read: true, lineHeight: 58, maxLines: 3 });
      p.text(
        `${skill?.name ?? check.skill} ${mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`}${check.edge === "boost" ? " · roll two, keep best" : check.edge === "snag" ? " · roll two, keep worst" : ""}`,
        M,
        y + 20,
        { size: 30, color: COLOR.muted },
      );
      y += 60;
      if (check.stakes) {
        p.fill(M, y, 4, 96, COLOR.alarm);
        y = p.para(`If it goes wrong: ${check.stakes}`, M + 24, y + 36, W - 24, { size: 32, read: true, maxLines: 2, lineHeight: 44 });
      }
      p.text("Grab the die and throw it", p.w / 2, p.h - 150, { size: 46, upper: true, tracking: 0.1, color: COLOR.signal, align: "center" });
      p.text("Or just tap it", p.w / 2, p.h - 90, { size: 30, color: COLOR.muted, align: "center" });
      return p.end();
    }

    // Actions: locked in, or choose.
    if (player.myAction) {
      p.text("Your move", M, y + 10, { size: 26, upper: true, tracking: 0.2, color: COLOR.muted });
      p.para(player.myAction, M, y + 80, W, { size: 46, read: true, lineHeight: 60, maxLines: 4 });
      const waiting = player.party.filter((x) => !x.ready).map((x) => (x.isMe ? "you" : x.name));
      p.text(waiting.length ? `Waiting on ${waiting.join(", ")}` : "Everyone's in.", M, p.h - 92, { size: 30, color: COLOR.muted });
      p.button("change", p.w - M - 240, p.h - 150, 240, 90, (hot) => p.text("Change", p.w - M - 120, p.h - 92, { size: 30, upper: true, tracking: 0.15, align: "center", color: hot ? COLOR.canvas : COLOR.ink }), this.actions.change);
      return p.end();
    }

    if (player.whisper) {
      p.rect(M, y - 44, W, 92, COLOR.muted, 2, [10, 8]);
      p.para(`Only you: ${player.whisper}`, M + 20, y + 6, W - 40, { size: 28, read: true, maxLines: 1 });
      y += 76;
    } else if (player.myEffects.length) {
      p.para(player.myEffects.join(" "), M, y, W, { size: 28, color: COLOR.caution, maxLines: 1 });
      y += 50;
    }
    y = p.para(campaign.prompt, M, y + 10, W, { size: 44, read: true, lineHeight: 56, maxLines: 2 }) + 6;

    const options = player.options.slice(0, 4);
    const oh = 96;
    options.forEach((o, i) => {
      const top = y + i * (oh + 12);
      p.button(
        `opt${i}`,
        M,
        top,
        W,
        oh,
        (hot) => {
          p.para(o.text, M + 28, top + 60, W - 260, { size: 36, read: true, maxLines: 1, color: hot ? COLOR.canvas : COLOR.ink });
          p.text(findSkill(o.skill)?.name ?? "", M + W - 28, top + 58, { size: 24, color: hot ? COLOR.canvas : COLOR.muted, align: "right", upper: true, tracking: 0.1 });
        },
        () => this.actions.choose(i),
      );
    });
    y += options.length * (oh + 12) + 14;

    // Chips: help someone, hold back, add an ability.
    let x = M;
    const chip = (id: string, label: string, onSelect: () => void, opts: { on?: boolean; enabled?: boolean } = {}) => {
      p.font({ size: 26, upper: true, tracking: 0.08 });
      const w = p.ctx.measureText(label.toUpperCase()).width + 48;
      if (x + w > p.w - M) {
        x = M;
        y += 84;
      }
      const left = x;
      if (opts.on) p.fill(left, y, w, 70, COLOR.signal);
      p.button(id, left, y, w, 70, (hot) => p.text(label, left + 24, y + 46, { size: 26, upper: true, tracking: 0.08, color: hot || opts.on ? COLOR.canvas : COLOR.ink }), onSelect, opts.enabled ?? true);
      x += w + 14;
    };
    for (const other of player.party.filter((m) => !m.isMe)) chip(`help-${other.characterId}`, `Help ${other.name}`, () => this.actions.help(other.characterId));
    chip("hold", "Hold back", this.actions.hold);
    const abilities = abilitiesFor(c.origin, c.calling);
    if (abilities.length) {
      x = M;
      y += 84;
      for (const a of abilities) chip(`ab-${a.name}`, `${a.name} · ${a.cost}`, () => this.actions.toggleAbility(a.name), { on: ability === a.name, enabled: c.charge >= a.cost });
    }
    p.end();
  }

  /** Watching a sim: a feed of what the bots just did, and the controls. */
  private drawSimConsole() {
    const p = this.console;
    const { campaign } = this.state!.table;
    const sim = this.state!.sim!;
    const M = 56;
    p.text(sim.paused ? "Sim paused" : "Sim running · bots are playing", M, 100, { size: 30, upper: true, tracking: 0.2, color: sim.paused ? COLOR.caution : COLOR.signal });
    const where = campaign.phase === "ended" ? "Finished" : `Scene ${campaign.sceneIndex + 1} of ${campaign.sceneCount}`;
    p.text(where, p.w - M, 100, { size: 26, upper: true, tracking: 0.15, color: COLOR.muted, align: "right" });
    p.line(M, 140, p.w - M, 140);

    if (campaign.phase === "ended") {
      p.text("The end.", M, 280, { size: 72 });
      p.para("The bots finished the adventure. The recap is on the screen.", M, 360, p.w - M * 2, { size: 36, read: true, color: COLOR.muted });
    } else {
      const lines = sim.feed.slice(-6);
      if (!lines.length) p.text("The bots are reading the scene…", M, 220, { size: 34, read: true, color: COLOR.muted });
      let y = 210;
      lines.forEach((line, i) => {
        const newest = i === lines.length - 1;
        y = p.para(line, M, y, p.w - M * 2, { size: newest ? 36 : 30, read: true, color: newest ? COLOR.ink : COLOR.muted, maxLines: 2, lineHeight: newest ? 48 : 40 }) + 18;
      });
    }

    // One control at a time. Restarting mid-game is never one trigger pull away.
    const by = p.h - 170;
    const bw = p.w - M * 2;
    if (campaign.phase === "ended") {
      p.button("newsim", M, by, bw, 110, (hot) => p.text("Watch another", M + bw / 2, by + 70, { size: 34, upper: true, tracking: 0.15, align: "center", color: hot ? COLOR.canvas : COLOR.signal }), this.actions.newSim);
    } else {
      p.button("pause", M, by, bw, 110, (hot) => p.text(sim.paused ? "Resume the bots" : "Pause the bots", M + bw / 2, by + 70, { size: 34, upper: true, tracking: 0.15, align: "center", color: hot ? COLOR.canvas : COLOR.ink }), this.actions.pause);
    }
    p.end();
  }

  // -------------------------------------------------------------------------
  // Drawing: other players' name cards and the tabletop holo

  private drawCard(a: Avatar) {
    const p = a.card;
    const s = a.seat;
    const c = s.character;
    const phase = this.state!.table.campaign.phase;
    p.begin(COLOR.canvas);
    p.frame(2, 2, p.w - 4, p.h - 4, 24);
    p.text(c.name, 32, 70, { size: 46 });
    p.text(`${c.origin} · ${c.calling}`, 32, 116, { size: 22, upper: true, tracking: 0.12, color: COLOR.muted });
    p.meter(32, 150, p.w - 64, 12, c.vigor, c.sheet.vigorMax, c.vigor === 0 ? COLOR.alarm : COLOR.signal);
    let word = "Watching";
    let color: string = COLOR.muted;
    if (c.vigor === 0) [word, color] = ["Down", COLOR.alarm];
    else if (phase === "rolls" && s.check && !s.check.rolled) [word, color] = ["Rolling", COLOR.caution];
    else if (phase === "rolls" && s.check?.result) [word, color] = [`Rolled ${s.check.result.kept} · ${s.check.result.outcome}`, OUTCOME[s.check.result.outcome]?.color ?? COLOR.ink];
    else if (phase === "actions") [word, color] = s.ready ? ["Ready", COLOR.signal] : ["Choosing", COLOR.muted];
    p.text(word, 32, 242, { size: 32, upper: true, tracking: 0.15, color });
    p.end();
  }

  private drawTabletop() {
    const p = this.tabletop;
    const { campaign } = this.state!.table;
    p.begin("");
    const cx = p.w / 2;
    const cy = p.h / 2;
    p.ctx.strokeStyle = COLOR.line;
    p.ctx.lineWidth = 3;
    for (const r of [180, 300]) {
      p.ctx.beginPath();
      p.ctx.arc(cx, cy, r, 0, Math.PI * 2);
      p.ctx.stroke();
    }
    p.text(campaign.code, cx, cy + 34, { size: 110, weight: 700, tracking: 0.3, color: COLOR.signal, align: "center" });
    p.text(campaign.phase === "lobby" ? "join code" : campaign.sceneTitle, cx, cy + 110, { size: 30, upper: true, tracking: 0.2, color: COLOR.muted, align: "center" });
    p.text("Wakefield", cx, cy - 110, { size: 30, upper: true, tracking: 0.4, color: COLOR.muted, align: "center" });
    p.end();
  }
}
