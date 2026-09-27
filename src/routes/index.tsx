import { createFileRoute } from "@tanstack/react-router";
import { SkillBridgeOpening } from "@/components/SkillBridgeOpening";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "SkillBridge AI – From learning to career ready" },
      { name: "description", content: "Build practical AI skills, strengthen your resume, master aptitude tests, and create an ATS-ready CV with SkillBridge AI." },
      { property: "og:title", content: "SkillBridge AI – From learning to career ready" },
      { property: "og:description", content: "A four-phase career roadmap for practical skills, resume building, aptitude preparation, and ATS-ready CV creation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SkillBridgeOpening,
});
