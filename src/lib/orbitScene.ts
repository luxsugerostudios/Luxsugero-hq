import * as THREE from "three";
import type { AgentState, LoadLevel } from "./orbit";

export type OrbitAgent = {
  id: string;
  name: string;
  kind: "hq" | "brand" | "dept";
  color: string;
  state: AgentState;
  parentId: string | null;
};

export type OrbitCrew = { id: string; name: string; count: number; level: LoadLevel };

export type OrbitFilter = "all" | "ai" | "crew";

type Callbacks = {
  onNode: (id: string) => void;
  onComet: (taskId: string) => void;
  onEmpty: () => void;
};

const STATE_COLOR: Record<AgentState, string> = {
  working: "#c6ff3d",
  waiting: "#ffb13b",
  queued: "#3de8ff",
  idle: "#6b6b88",
  sync: "#4a4a62",
};

export const LOAD_COLOR: Record<LoadLevel, string> = {
  room: "#3de8ff",
  steady: "#c6ff3d",
  busy: "#ffb13b",
  overloaded: "#ff4fa3",
};

const RINGS = [
  null,
  { r: 8, tilt: 0, speed: 0.12 },
  { r: 12.5, tilt: 0.42, speed: -0.07 },
  { r: 18, tilt: -0.18, speed: 0.045 },
] as const;

type Node = {
  id: string;
  name: string;
  kind: "hq" | "brand" | "dept" | "crew";
  ring: 0 | 1 | 2 | 3;
  holder: THREE.Object3D;
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  label: HTMLDivElement;
  angle: number;
  phase: number;
  visible: boolean;
  state?: AgentState;
  parentId?: string | null;
  color?: string;
  count?: number;
};

type Comet = {
  taskId: string;
  pivot: THREE.Object3D;
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  speed: number;
  flying: boolean;
};

type Flight = {
  comet: Comet;
  target: Node;
  from: THREE.Vector3;
  t: number;
  done: () => void;
};

type Beam = {
  curve: THREE.QuadraticBezierCurve3;
  line: THREE.Line;
  spark: THREE.Sprite;
  t: number;
};

function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export class OrbitScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  private light = new THREE.PointLight(0xffffff, 1.4, 120, 0);
  private glowTex = glowTexture();
  private rings: THREE.Group[] = [];
  private nodes = new Map<string, Node>();
  private comets = new Map<string, Comet>();
  private flights: Flight[] = [];
  private beams: Beam[] = [];
  private shell: THREE.Mesh;
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private clock = new THREE.Clock();
  private frameId = 0;
  private theta = 0.6;
  private phi = 1.12;
  private dist = 40;
  private tTheta = 0.6;
  private tPhi = 1.12;
  private tDist = 40;
  private drag: { x: number; y: number; theta: number; phi: number; mouse: boolean } | null = null;
  private hovered: Node | null = null;
  private filter: OrbitFilter = "all";
  private paused = false;
  private beamClock = 0;
  private reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private resizeObserver: ResizeObserver;
  private cleanup: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private labels: HTMLElement,
    private callbacks: Callbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    this.scene.add(this.light);
    this.addStars();
    RINGS.forEach((ring, index) => {
      const group = new THREE.Group();
      this.scene.add(group);
      this.rings[index] = group;
      if (!ring) return;
      group.rotation.x = ring.tilt;
      const points: THREE.Vector3[] = [];
      for (let k = 0; k <= 128; k++) {
        const a = (k / 128) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(a) * ring.r, 0, Math.sin(a) * ring.r));
      }
      const color = index === 2 ? 0xf4f4f8 : index === 1 ? 0x3de8ff : 0x5b5bff;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.28 }),
      );
      line.computeLineDistances();
      group.add(line);
    });
    this.shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.3, 1),
      new THREE.MeshBasicMaterial({ color: 0xc6ff3d, wireframe: true, transparent: true, opacity: 0.22 }),
    );
    this.scene.add(this.shell);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.bindInput();
    this.loop();
  }

  private glow(color: string, size: number): THREE.Sprite {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: new THREE.Color(color),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    sprite.scale.set(size, size, 1);
    return sprite;
  }

  private addStars() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 90 + Math.random() * 120;
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(b) * Math.cos(a);
      positions[i * 3 + 1] = r * Math.cos(b);
      positions[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.scene.add(
      new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x9b9bd0, size: 0.6, transparent: true, opacity: 0.7 })),
    );
  }

  private baseGlow(node: Node): number {
    if (node.kind === "hq") return 7;
    if (node.kind === "brand") return 4.2;
    if (node.kind === "crew") return 3 + Math.min(node.count ?? 0, 9) * 0.35;
    return 3.2;
  }

  private makeNode(id: string, name: string, kind: Node["kind"], ring: Node["ring"], color: string): Node {
    let mesh: THREE.Mesh;
    if (kind === "hq") {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 48, 48),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.35 }),
      );
    } else if (kind === "crew") {
      mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.75, 0),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.3, flatShading: true }),
      );
    } else {
      const size = kind === "brand" ? 1.15 : 0.72;
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 32, 32),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.45 }),
      );
    }
    const holder = new THREE.Object3D();
    holder.add(mesh);
    const glow = this.glow(color, 3);
    holder.add(glow);
    this.rings[ring].add(holder);
    const label = document.createElement("div");
    label.className = `orbit-label${kind === "crew" ? " human" : ""}`;
    label.textContent = name;
    this.labels.appendChild(label);
    const node: Node = { id, name, kind, ring, holder, mesh, glow, label, angle: 0, phase: Math.random() * 6.28, visible: true };
    mesh.userData.nodeId = id;
    this.nodes.set(id, node);
    return node;
  }

  private removeNode(node: Node) {
    this.rings[node.ring].remove(node.holder);
    node.label.remove();
    node.mesh.geometry.dispose();
    this.nodes.delete(node.id);
  }

  private spread(ring: 1 | 2 | 3) {
    const list = [...this.nodes.values()].filter((node) => node.ring === ring);
    list.forEach((node, index) => {
      node.angle = (index / list.length) * Math.PI * 2 + ring * 0.7;
    });
  }

  setAgents(agents: OrbitAgent[]) {
    const ids = new Set(agents.map((agent) => agent.id));
    for (const node of [...this.nodes.values()]) {
      if (node.kind !== "crew" && !ids.has(node.id)) this.removeNode(node);
    }
    let added = false;
    for (const agent of agents) {
      let node = this.nodes.get(agent.id);
      if (!node) {
        const ring = agent.kind === "hq" ? 0 : agent.kind === "brand" ? 1 : 3;
        node = this.makeNode(agent.id, agent.name, agent.kind, ring, agent.color);
        added = true;
      }
      node.state = agent.state;
      node.parentId = agent.parentId;
      node.color = agent.color;
      node.glow.material.color.set(STATE_COLOR[agent.state]);
      (node.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = agent.state === "sync" ? 0.12 : 0.35;
    }
    if (added) {
      this.spread(1);
      this.spread(3);
    }
    this.applyFilter();
  }

  setCrew(crew: OrbitCrew[]) {
    const ids = new Set(crew.map((person) => person.id));
    for (const node of [...this.nodes.values()]) {
      if (node.kind === "crew" && !ids.has(node.id)) this.removeNode(node);
    }
    let added = false;
    for (const person of crew) {
      let node = this.nodes.get(person.id);
      if (!node) {
        node = this.makeNode(person.id, person.name, "crew", 2, "#ffffff");
        added = true;
      }
      node.count = person.count;
      node.glow.material.color.set(LOAD_COLOR[person.level]);
      node.mesh.scale.setScalar(0.8 + Math.min(person.count, 9) * 0.09);
    }
    if (added) this.spread(2);
    this.applyFilter();
  }

  setComets(taskIds: string[], selected: string | null) {
    const ids = new Set(taskIds);
    for (const comet of [...this.comets.values()]) {
      if (!ids.has(comet.taskId) && !comet.flying) {
        this.scene.remove(comet.pivot);
        comet.mesh.geometry.dispose();
        this.comets.delete(comet.taskId);
      }
    }
    for (const taskId of taskIds) {
      if (this.comets.has(taskId)) continue;
      const pivot = new THREE.Object3D();
      pivot.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      const mesh = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.42, 0),
        new THREE.MeshStandardMaterial({ color: 0xff4fa3, emissive: 0xff4fa3, emissiveIntensity: 0.7, flatShading: true }),
      );
      mesh.position.x = 4.3 + Math.random() * 1.4;
      mesh.userData.taskId = taskId;
      const glow = this.glow("#ff4fa3", 2.2);
      mesh.add(glow);
      pivot.add(mesh);
      this.scene.add(pivot);
      this.comets.set(taskId, { taskId, pivot, mesh, glow, speed: 0.25 + Math.random() * 0.35, flying: false });
    }
    for (const comet of this.comets.values()) {
      const on = comet.taskId === selected;
      comet.glow.material.color.set(on ? "#c6ff3d" : "#ff4fa3");
      if (!comet.flying) comet.mesh.scale.setScalar(on ? 1.6 : 1);
    }
  }

  /** Animate a task shard into a crew member. Resolves when it lands. */
  fly(taskId: string, personId: string): Promise<void> {
    const comet = this.comets.get(taskId);
    const target = this.nodes.get(personId);
    if (!comet || !target || comet.flying) return Promise.resolve();
    comet.flying = true;
    this.scene.attach(comet.mesh);
    return new Promise((resolve) => {
      this.flights.push({
        comet,
        target,
        from: comet.mesh.position.clone(),
        t: 0,
        done: () => {
          this.scene.remove(comet.mesh);
          this.scene.remove(comet.pivot);
          comet.mesh.geometry.dispose();
          this.comets.delete(taskId);
          resolve();
        },
      });
    });
  }

  setFilter(filter: OrbitFilter) {
    this.filter = filter;
    this.applyFilter();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  zoom(direction: 1 | -1) {
    this.tDist = Math.min(70, Math.max(22, this.tDist + direction * 6));
  }

  private applyFilter() {
    for (const node of this.nodes.values()) {
      node.visible =
        this.filter === "all" ||
        (this.filter === "ai" && node.kind !== "crew") ||
        (this.filter === "crew" && (node.kind === "crew" || node.kind === "hq"));
      node.holder.visible = node.visible;
    }
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.tDist = w < 640 ? 66 : 40;
  }

  private hit(event: PointerEvent): THREE.Object3D | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const targets: THREE.Object3D[] = [];
    for (const node of this.nodes.values()) if (node.visible) targets.push(node.mesh);
    for (const comet of this.comets.values()) if (!comet.flying) targets.push(comet.mesh);
    const hits = this.ray.intersectObjects(targets, false);
    return hits[0]?.object ?? null;
  }

  private bindInput() {
    const c = this.canvas;
    const down = (event: PointerEvent) => {
      this.drag = { x: event.clientX, y: event.clientY, theta: this.tTheta, phi: this.tPhi, mouse: event.pointerType === "mouse" };
      if (event.pointerType === "mouse") {
        c.setPointerCapture(event.pointerId);
        c.classList.add("is-drag");
      }
    };
    const move = (event: PointerEvent) => {
      if (this.drag) {
        const dx = event.clientX - this.drag.x;
        const dy = event.clientY - this.drag.y;
        this.tTheta = this.drag.theta - dx * 0.006;
        if (this.drag.mouse) this.tPhi = Math.min(1.5, Math.max(0.25, this.drag.phi - dy * 0.005));
        return;
      }
      if (event.pointerType !== "mouse") return;
      const object = this.hit(event);
      c.classList.toggle("is-hover", Boolean(object));
      const node = object?.userData.nodeId ? this.nodes.get(object.userData.nodeId as string) ?? null : null;
      if (this.hovered && this.hovered !== node) this.hovered.label.classList.remove("hot");
      this.hovered = node;
      node?.label.classList.add("hot");
    };
    const up = (event: PointerEvent) => {
      if (!this.drag) return;
      const moved = Math.hypot(event.clientX - this.drag.x, event.clientY - this.drag.y);
      this.drag = null;
      c.classList.remove("is-drag");
      if (event.type !== "pointerup" || moved >= 6) return;
      const object = this.hit(event);
      if (!object) this.callbacks.onEmpty();
      else if (object.userData.taskId) this.callbacks.onComet(object.userData.taskId as string);
      else if (object.userData.nodeId) this.callbacks.onNode(object.userData.nodeId as string);
    };
    const leave = () => {
      this.hovered?.label.classList.remove("hot");
      this.hovered = null;
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", leave);
    this.cleanup.push(() => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("pointerleave", leave);
    });
  }

  private worldOf(node: Node): THREE.Vector3 {
    const v = new THREE.Vector3();
    node.holder.getWorldPosition(v);
    return v;
  }

  private beam(from: Node, to: Node) {
    const a = this.worldOf(from);
    const b = this.worldOf(to);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += 4 + a.distanceTo(b) * 0.15;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(from.color ?? "#f4f4f8"), transparent: true, opacity: 0 }),
    );
    const spark = this.glow(from.color ?? "#c6ff3d", 1.6);
    this.scene.add(line, spark);
    this.beams.push({ curve, line, spark, t: 0 });
  }

  private loop = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const still = this.paused || this.reduce;
    const sp = still ? 0 : 1;
    if (!this.drag && !still) this.tTheta += dt * 0.04;
    this.theta += (this.tTheta - this.theta) * 0.08;
    this.phi += (this.tPhi - this.phi) * 0.08;
    this.dist += (this.tDist - this.dist) * 0.08;
    this.camera.position.set(
      this.dist * Math.sin(this.phi) * Math.cos(this.theta),
      this.dist * Math.cos(this.phi),
      this.dist * Math.sin(this.phi) * Math.sin(this.theta),
    );
    this.camera.lookAt(0, 0, 0);
    this.light.position.copy(this.camera.position);
    this.shell.rotation.y += dt * 0.2 * sp;
    this.shell.rotation.x += dt * 0.07 * sp;

    for (const node of this.nodes.values()) {
      if (node.ring) {
        const ring = RINGS[node.ring]!;
        node.angle += dt * ring.speed * sp;
        node.holder.position.set(Math.cos(node.angle) * ring.r, 0, Math.sin(node.angle) * ring.r);
      }
      node.mesh.rotation.y += dt * 0.6 * sp;
      const base = this.baseGlow(node);
      let k = 1;
      if (!this.reduce && node.state === "working") k = 1 + Math.sin(t * 3 + node.phase) * 0.18;
      else if (!this.reduce && node.state === "waiting") k = 1 + Math.sin(t * 1.6 + node.phase) * 0.14;
      else if (node.state === "sync" || node.state === "idle") k = 0.85;
      node.glow.scale.setScalar(base * k);
    }

    for (const comet of this.comets.values()) {
      if (comet.flying) continue;
      comet.pivot.rotation.y += dt * comet.speed * sp;
      comet.mesh.rotation.x += dt * 1.5 * sp;
      comet.mesh.rotation.z += dt * sp;
    }

    for (let i = this.flights.length - 1; i >= 0; i--) {
      const flight = this.flights[i];
      flight.t += this.reduce ? 1 : dt / 0.9;
      const k = Math.min(flight.t, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const target = this.worldOf(flight.target);
      const mid = flight.from.clone().add(target).multiplyScalar(0.5);
      mid.y += 5;
      const a = flight.from.clone().lerp(mid, e);
      const b = mid.clone().lerp(target, e);
      flight.comet.mesh.position.copy(a.lerp(b, e));
      flight.comet.mesh.scale.setScalar(1.4 - e * 0.9);
      if (k >= 1) {
        this.flights.splice(i, 1);
        flight.done();
      }
    }

    if (!still) {
      this.beamClock += dt;
      if (this.beamClock > 1.6) {
        this.beamClock = 0;
        const working = [...this.nodes.values()].filter(
          (node) => node.visible && node.state === "working" && node.parentId && this.nodes.get(node.parentId)?.visible,
        );
        if (working.length) {
          const from = working[Math.floor(Math.random() * working.length)];
          this.beam(from, this.nodes.get(from.parentId!)!);
        }
      }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const beam = this.beams[i];
      beam.t += dt * 0.55;
      const k = Math.min(beam.t, 1);
      beam.spark.position.copy(beam.curve.getPoint(k));
      (beam.line.material as THREE.LineBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.55;
      if (k >= 1) {
        this.scene.remove(beam.line, beam.spark);
        beam.line.geometry.dispose();
        this.beams.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
    this.frameId = requestAnimationFrame(this.loop);
  };

  private placeLabels() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const v = new THREE.Vector3();
    for (const node of this.nodes.values()) {
      if (!node.visible) {
        node.label.style.opacity = "0";
        continue;
      }
      node.holder.getWorldPosition(v);
      v.y += node.kind === "hq" ? 3.4 : node.kind === "brand" ? 1.8 : 1.3;
      v.project(this.camera);
      if (v.z > 1) {
        node.label.style.opacity = "0";
        continue;
      }
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      const depth = Math.max(0.35, Math.min(1, 1.6 - v.z));
      const hide = w < 640 && node.kind === "dept" && node !== this.hovered;
      node.label.style.opacity = hide ? "0" : String(depth);
      node.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
  }

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.cleanup.forEach((fn) => fn());
    for (const node of [...this.nodes.values()]) this.removeNode(node);
    this.renderer.dispose();
  }
}
