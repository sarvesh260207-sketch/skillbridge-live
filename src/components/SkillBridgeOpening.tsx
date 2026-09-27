import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { ArrowRight, BookOpen, BrainCircuit, FileText, ScanSearch, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Stage = "blank" | "title" | "quote" | "roadmap" | "course";
const phases = [
  { number: "01", title: "Skill building & projects", detail: "Build practical AI skills through guided lessons and portfolio-ready work.", icon: BookOpen },
  { number: "02", title: "Resume building", detail: "Turn your experience into a focused, credible professional story.", icon: FileText },
  { number: "03", title: "Aptitude preparation", detail: "Practice quantitative, reasoning and verbal tests at progressive levels.", icon: BrainCircuit },
  { number: "04", title: "ATS CV maker", detail: "Create a tailored CV designed to pass screening systems and win interviews.", icon: ScanSearch },
];
const colors = { white: "#ffffff", blue: "#2186e8", pale: "#dff2ff", mist: "#eef8ff" };

function RoadmapScene() {
  const group = useRef<THREE.Group>(null);
  const points = useMemo(() => [new THREE.Vector3(-7, -1.1, 0), new THREE.Vector3(-2.4, 1.05, -0.8), new THREE.Vector3(2.35, -0.7, 0.35), new THREE.Vector3(7, 1.1, -0.5)], []);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    if (!group.current) return;
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, state.pointer.y * 0.05, 3, delta);
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, state.pointer.x * 0.08, 3, delta);
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.08;
  });
  return <group ref={group} rotation={[-0.08, 0, 0]}>
    <mesh><tubeGeometry args={[curve, 72, 0.065, 8, false]} /><meshStandardMaterial color={colors.blue} roughness={0.28} metalness={0.14} /></mesh>
    {points.map((point, index) => <group key={index} position={point}>
      <mesh castShadow><sphereGeometry args={[0.48, 28, 28]} /><meshPhysicalMaterial color={index % 2 === 0 ? colors.white : colors.pale} roughness={0.16} metalness={0.08} clearcoat={0.85} clearcoatRoughness={0.18} /></mesh>
      <mesh scale={1.38}><sphereGeometry args={[0.48, 20, 20]} /><meshBasicMaterial color={colors.blue} transparent opacity={0.08} depthWrite={false} /></mesh>
    </group>)}
    {[-6.1, -3.8, 0.1, 4.3, 6.2].map((x, index) => <mesh key={x} position={[x, index % 2 ? -2.8 : 2.8, -2.2]} rotation={[0.7, 0.4, index * 0.35]}>
      <octahedronGeometry args={[0.34 + index * 0.025]} /><meshPhysicalMaterial color={index % 2 ? colors.mist : colors.pale} transparent opacity={0.62} roughness={0.22} />
    </mesh>)}
  </group>;
}

function RoadmapCanvas() {
  return <div className="absolute inset-0" aria-hidden="true"><Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.2, 12], fov: 43 }} gl={{ antialias: true, powerPreference: "high-performance", alpha: true }} shadows>
    <ambientLight intensity={1.35} /><directionalLight position={[4, 8, 7]} intensity={2.8} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
    <Environment><Lightformer intensity={2.5} position={[0, 5, 3]} scale={[12, 4, 1]} /><Lightformer intensity={1.4} color={colors.pale} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[10, 2, 1]} /></Environment>
    <RoadmapScene />
  </Canvas></div>;
}

export function SkillBridgeOpening() {
  const [stage, setStage] = useState<Stage>("blank");
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setStage("roadmap"); return; }
    const timers = [
      window.setTimeout(() => setStage("title"), 3500),
      window.setTimeout(() => setStage("quote"), 6500),
      window.setTimeout(() => setStage("roadmap"), 12500),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  if (stage === "course") return <iframe src="/skillbridge.html" title="SkillBridge AI course" className="fixed inset-0 h-full w-full border-0 bg-background" />;

  return <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
    <Button variant="ghost" size="sm" onClick={() => setStage("roadmap")} className={cn("absolute right-5 top-5 z-30 gap-2 text-muted-foreground transition-opacity duration-500", stage === "roadmap" ? "pointer-events-none opacity-0" : "opacity-100")}>
      <SkipForward aria-hidden="true" /> Skip intro
    </Button>

    <section className={cn("absolute inset-0 z-20 grid place-items-center bg-background px-6 transition-opacity duration-700", stage === "title" ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={stage !== "title"}>
      <h1 className="opening-title text-center text-5xl font-semibold text-primary md:text-7xl">SkillBridge AI</h1>
    </section>

    <section className={cn("absolute inset-0 z-20 grid place-items-center bg-background px-7 transition-opacity duration-700", stage === "quote" ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={stage !== "quote"}>
      <figure className="opening-quote max-w-4xl text-center">
        <blockquote className="font-serif text-2xl leading-relaxed text-foreground md:text-4xl md:leading-relaxed">“Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work. And the only way to do great work is to love what you do.”</blockquote>
        <figcaption className="mt-7 text-sm font-medium text-muted-foreground">Steve Jobs</figcaption>
      </figure>
    </section>

    <section className={cn("absolute inset-0 transition-opacity duration-1000", stage === "roadmap" ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={stage !== "roadmap"}>
      <RoadmapCanvas />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 md:px-10">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">SB</span><span className="text-sm font-semibold">SkillBridge AI</span></div>
        <span className="hidden text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">Your path to career readiness</span>
      </div>
      <div className="absolute inset-0 z-10 flex flex-col justify-between px-5 pb-6 pt-20 md:px-10 md:pb-9">
        <header className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">From learning to hired</p>
          <h2 className="text-3xl font-semibold leading-tight md:text-5xl">One clear path. Four decisive phases.</h2>
        </header>
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          {phases.map(({ number, title, detail, icon: Icon }, index) => <article key={number} className="roadmap-card border border-border/80 bg-background/90 p-3 shadow-sm backdrop-blur-md md:p-4" style={{ animationDelay: `${index * 140}ms` }}>
            <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Phase {number}</span><Icon className="h-4 w-4 text-primary" aria-hidden="true" /></div>
            <h3 className="text-sm font-semibold leading-snug md:text-base">{title}</h3>
            <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:block">{detail}</p>
          </article>)}
        </div>
        <div className="flex justify-center"><Button size="lg" onClick={() => setStage("course")} className="h-11 gap-2 px-6 shadow-lg shadow-primary/20">Enter SkillBridge <ArrowRight aria-hidden="true" /></Button></div>
      </div>
    </section>
  </main>;
}
