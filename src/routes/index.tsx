import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SkillBridge AI – Level up your career" },
      {
        name: "description",
        content:
          "AI lessons, real certificates, hiring-level aptitude tests, and a CV that beats the ATS filter — gamified so you can see your readiness score climb.",
      },
      { property: "og:title", content: "SkillBridge AI – Level up your career" },
      {
        property: "og:description",
        content:
          "AI lessons, real certificates, hiring-level aptitude tests, and a CV that beats the ATS filter — gamified so you can see your readiness score climb.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <iframe
      src="/skillbridge.html"
      title="SkillBridge AI"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
      }}
    />
  );
}
