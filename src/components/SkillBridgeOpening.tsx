import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { ArrowRight, BookOpen, BrainCircuit, FileText, ScanSearch, SkipForward } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Stage = "blank" | "title" | "quote" | "roadmap" | "course";
type CardRefs = MutableRefObject<(HTMLElement | null)[]>;

const phases = [
  { number: "01", title: "Skill building & projects", detail: "Build practical AI skills through guided lessons and portfolio-ready work.", icon: BookOpen },
  { number: "02", title: "Resume building", detail: "Turn your experience into a focused, credible professional story.", icon: FileText },
  { number: "03", title: "Aptitude preparation", detail: "Practice quantitative, reasoning and verbal tests at progressive levels.", icon: BrainCircuit },
  { number: "04", title: "ATS CV maker", detail: "Create a tailored CV designed to pass screening systems and win interviews.", icon: ScanSearch },
];
const colors = { white: "#ffffff", blue: "#2186e8", pale: "#dff2ff", mist: "#eef8ff" };

// Timeline (ms): white hold -> title in (2s hold) -> out -> quote in (5s hold) -> out -> roadmap
const FADE = 900;
const T_TITLE_IN = 3600;
const T_TITLE_OUT = T_TITLE_IN + FADE + 2000;
const T_QUOTE_IN = T_TITLE_OUT + FADE;
const T_QUOTE_OUT = T_QUOTE_IN + FADE + 5000;
const T_ROADMAP = T_QUOTE_OUT + FADE;
const REVEAL_SECONDS = 3.4;
const SEGMENTS = 120;
const RADIAL = 10;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function RoadmapScene({ active, instant, cards }: { active: boolean; instant: boolean; cards: CardRefs }) {
  const group = useRef<THREE.Group>(null);
  const nodeRefs = useRef<(THREE.Group | null)[]>([]);
  const startRef = useRef<number | null>(null);
  const { size } = useThree();
  const portrait = size.width < size.height * 0.95;
  const halfW = Math.tan(THREE.MathUtils.degToRad(43 / 2)) * 12 * (size.width / size.height);
  const scale = portrait ? 1 : Math.min(1, (0.8 * halfW) / 7.4);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const { nodePts, curve, fractions, tubeGeo, glowGeo } = useMemo(() => {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const portraitNodes = [v(-1.8, 2.2, 0), v(-1.8, 0.55, 0.2), v(-1.8, -1.1, 0), v(-1.8, -2.75, 0.2)];
    const landscapeNodes = [v(-7, -1.1, 0), v(-2.4, 1.05, -0.8), v(2.35, -0.7, 0.35), v(7, 1.1, -0.5)];
    const nodes = portrait ? portraitNodes : landscapeNodes;
    const path: THREE.Vector3[] = portrait
      ? [v(-1.8, 2.2, 0), v(-1.15, 1.4, -0.3), v(-1.8, 0.55, 0.2), v(-2.45, -0.28, 0.1), v(-1.8, -1.1, 0), v(-1.15, -1.95, -0.3), v(-1.8, -2.75, 0.2)]
      : nodes;
    const c = new THREE.CatmullRomCurve3(path);
    const fr = nodes.map((p) => {
      let best = 0, bd = Infinity;
      for (let j = 0; j <= 240; j++) { const d = c.getPointAt(j / 240).distanceToSquared(p); if (d < bd) { bd = d; best = j; } }
      return best / 240;
    });
    return { nodePts: nodes, curve: c, fractions: fr, tubeGeo: new THREE.TubeGeometry(c, SEGMENTS, 0.065, RADIAL, false), glowGeo: new THREE.TubeGeometry(c, SEGMENTS, 0.17, RADIAL, false) };
  }, [portrait]);

  useEffect(() => () => { tubeGeo.dispose(); glowGeo.dispose(); }, [tubeGeo, glowGeo]);

  // Card widths only change with viewport (not per frame) to avoid layout work at 60fps.
  useLayoutEffect(() => {
    const width = portrait ? Math.min(340, size.width - ((0.5 - (0.5 * 1.8) / halfW) * size.width + 34) - 16) : Math.min(230, Math.max(140, size.width * 0.17));
    cards.current.forEach((el) => { if (el) el.style.width = `${Math.max(120, width)}px`; });
  }, [portrait, size.width, size.height, halfW, cards]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const g = group.current;
    if (!g) return;
    if (active && startRef.current === null) startRef.current = performance.now();
    const t = !active ? 0 : instant ? 99 : (performance.now() - (startRef.current ?? performance.now())) / 1000;
    const p = easeInOut(clamp01(t / REVEAL_SECONDS));
    const drawn = Math.round(p * SEGMENTS) * RADIAL * 6;
    tubeGeo.setDrawRange(0, drawn);
    glowGeo.setDrawRange(0, drawn);

    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -0.08 + state.pointer.y * 0.05, 3, delta);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, state.pointer.x * 0.08, 3, delta);
    g.position.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.08;
    g.updateMatrixWorld();

    const pp = p * 1.1;
    nodePts.forEach((_, i) => {
      const k = clamp01((pp - (fractions[i] ?? 0)) / 0.1);
      const node = nodeRefs.current[i];
      if (node) { node.scale.setScalar(Math.max(0.0001, easeOutBack(k))); node.visible = k > 0; }
      const el = cards.current[i];
      if (el && node) {
        node.getWorldPosition(tmp);
        tmp.project(state.camera);
        const x = (tmp.x * 0.5 + 0.5) * size.width;
        const y = (-tmp.y * 0.5 + 0.5) * size.height;
        const s = 0.94 + 0.06 * k;
        el.style.opacity = String(k);
        el.style.transform = portrait
          ? `translate3d(${x + 34}px, ${y}px, 0) translateY(-50%) scale(${s})`
          : `translate3d(${x}px, ${y + 40}px, 0) translateX(-50%) scale(${s})`;
      }
    });
  });

  const floaters: [number, number][] = portrait
    ? [[2.2, 3.2], [2.6, 0.9], [2.3, -1.6], [2.7, -3.4], [0.4, -0.2]]
    : [[-6.1, 2.8], [-3.8, -2.8], [0.1, 2.8], [4.3, -2.8], [6.2, 2.8]];

  return (
    <group ref={group} scale={scale} rotation={[-0.08, 0, 0]}>
      <mesh geometry={glowGeo}><meshBasicMaterial color={colors.blue} transparent opacity={0.14} depthWrite={false} /></mesh>
      <mesh geometry={tubeGeo}><meshStandardMaterial color={colors.blue} roughness={0.28} metalness={0.14} /></mesh>
      {nodePts.map((point, index) => (
        <group key={index} position={point} ref={(el) => { nodeRefs.current[index] = el; }}>
          <mesh><sphereGeometry args={[0.48, 28, 28]} /><meshPhysicalMaterial color={index % 2 === 0 ? colors.white : colors.pale} roughness={0.16} metalness={0.08} clearcoat={0.85} clearcoatRoughness={0.18} /></mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.68, 0.018, 12, 64]} /><meshBasicMaterial color={colors.blue} transparent opacity={0.55} /></mesh>
          <mesh scale={1.38}><sphereGeometry args={[0.48, 20, 20]} /><meshBasicMaterial color={colors.blue} transparent opacity={0.08} depthWrite={false} /></mesh>
        </group>
      ))}
      {floaters.map(([x, y], index) => (
        <mesh key={index} position={[x, y, -2.2]} rotation={[0.7, 0.4, index * 0.35]}>
          <octahedronGeometry args={[0.34 + index * 0.025]} />
          <meshPhysicalMaterial color={index % 2 ? colors.mist : colors.pale} transparent opacity={0.62} roughness={0.22} />
        </mesh>
      ))}
    </group>
  );
}

function RoadmapCanvas({ active, instant, cards }: { active: boolean; instant: boolean; cards: CardRefs }) {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <Canvas dpr={[1, 1.5]} frameloop={active ? "always" : "demand"} camera={{ position: [0, 0.2, 12], fov: 43 }} gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}>
        <ambientLight intensity={1.35} />
        <directionalLight position={[4, 8, 7]} intensity={2.8} />
        <Environment frames={1}>
          <Lightformer intensity={2.5} position={[0, 5, 3]} scale={[12, 4, 1]} />
          <Lightformer intensity={1.4} color={colors.pale} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[10, 2, 1]} />
        </Environment>
        <RoadmapScene active={active} instant={instant} cards={cards} />
      </Canvas>
    </div>
  );
}

export function SkillBridgeOpening() {
  const [stage, setStage] = useState<Stage>("blank");
  const [ready, setReady] = useState(false);
  const [instant, setInstant] = useState(false);
  const timersRef = useRef<number[]>([]);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  const clearTimers = () => { timersRef.current.forEach(window.clearTimeout); timersRef.current = []; };
  const showRoadmap = () => { clearTimers(); setStage("roadmap"); };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setInstant(true); setStage("roadmap"); setReady(true); return; }
    const at = (ms: number, s: Stage) => window.setTimeout(() => setStage(s), ms);
    timersRef.current = [at(T_TITLE_IN, "title"), at(T_TITLE_OUT, "blank"), at(T_QUOTE_IN, "quote"), at(T_QUOTE_OUT, "blank"), at(T_ROADMAP, "roadmap")];
    return clearTimers;
  }, []);

  useEffect(() => {
    if (stage !== "roadmap" || instant) return;
    const id = window.setTimeout(() => setReady(true), REVEAL_SECONDS * 1000 + 400);
    return () => window.clearTimeout(id);
  }, [stage, instant]);

  if (stage === "course") return <iframe src="/skillbridge.html" title="SkillBridge AI course" className="fixed inset-0 h-full w-full border-0 bg-background" />;

  const fade = "transition-opacity ease-in-out";
  return (
    <main className="fixed inset-0 overflow-hidden bg-white text-foreground">
      <Button variant="ghost" size="sm" onClick={showRoadmap} className={cn("absolute right-5 top-5 z-30 gap-2 text-muted-foreground transition-opacity duration-500", stage === "roadmap" ? "pointer-events-none opacity-0" : "opacity-100")}>
        <SkipForward aria-hidden="true" /> Skip intro
      </Button>

      <section className={cn("absolute inset-0 z-20 grid place-items-center bg-white px-6", fade, stage === "title" ? "opacity-100" : "pointer-events-none opacity-0")} style={{ transitionDuration: `${FADE}ms` }} aria-hidden={stage !== "title"}>
        <h1 className={cn("text-center text-5xl font-semibold tracking-tight transition-transform ease-out md:text-7xl", stage === "title" ? "scale-100" : "scale-95")} style={{ color: colors.blue, transitionDuration: `${FADE + 300}ms` }}>SkillBridge AI</h1>
      </section>

      <section className={cn("absolute inset-0 z-20 grid place-items-center bg-white px-7", fade, stage === "quote" ? "opacity-100" : "pointer-events-none opacity-0")} style={{ transitionDuration: `${FADE}ms` }} aria-hidden={stage !== "quote"}>
        <figure className="max-w-3xl text-center">
          <blockquote className="text-3xl leading-relaxed md:text-5xl md:leading-relaxed" style={{ color: "#000", fontFamily: '"Times New Roman", Times, serif' }}>“The only way to do great work is to love what you do.”</blockquote>
          <figcaption className="mt-7 text-base" style={{ color: "#000", fontFamily: '"Times New Roman", Times, serif' }}>— Steve Jobs</figcaption>
        </figure>
      </section>

      <section className={cn("absolute inset-0 transition-opacity duration-1000", stage === "roadmap" ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={stage !== "roadmap"}>
        <RoadmapCanvas active={stage === "roadmap"} instant={instant} cards={cardRefs} />
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 md:px-10">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">SB</span><span className="text-sm font-semibold">SkillBridge AI</span></div>
          <span className="hidden text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">Your path to career readiness</span>
        </div>
        <header className="absolute inset-x-0 top-20 z-10 mx-auto max-w-2xl px-5 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">From learning to hired</p>
          <h2 className="text-3xl font-semibold leading-tight md:text-5xl">One clear path. Four decisive phases.</h2>
        </header>
        <div className="pointer-events-none absolute inset-0 z-10">
          {phases.map(({ number, title, detail, icon: Icon }, index) => (
            <article key={number} ref={(el) => { cardRefs.current[index] = el; }} className="roadmap-card absolute left-0 top-0 border border-border/80 bg-background/90 p-3 opacity-0 shadow-sm backdrop-blur-md will-change-transform md:p-4">
              <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Phase {number}</span><Icon className="h-4 w-4 text-primary" aria-hidden="true" /></div>
              <h3 className="text-sm font-semibold leading-snug md:text-base">{title}</h3>
              <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">{detail}</p>
            </article>
          ))}
        </div>
        <div className={cn("absolute inset-x-0 bottom-6 z-10 flex justify-center transition-opacity duration-700", ready ? "opacity-100" : "pointer-events-none opacity-0")}>
          <Button size="lg" onClick={() => setStage("course")} className="h-11 gap-2 px-6 shadow-lg shadow-primary/20">Enter SkillBridge <ArrowRight aria-hidden="true" /></Button>
        </div>
      </section>
    </main>
  );
}
