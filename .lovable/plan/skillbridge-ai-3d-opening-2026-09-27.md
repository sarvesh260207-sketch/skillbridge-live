# SkillBridge AI 3D opening

## Build
- Replace the immediate course view with a full-screen premium white-and-light-blue opening.
- Sequence the opening as requested: blank white hold, centered blue “SkillBridge AI”, Steve Jobs quote, then the four-phase roadmap.
- Render a lightweight 3D roadmap with connected milestones, subtle depth, reflections, and restrained motion designed for smooth 60 FPS.
- Add an accessible skip control and reduced-motion behavior, then let visitors enter the existing course without changing course features or saved progress.

## Verify
- Check desktop and mobile framing, sequence timing, smooth animation, roadmap readability, and entry into the existing course.
- Confirm the page has no build, runtime, console, or missing-resource errors.

## GitHub
- Prepare the edited project for the existing GitHub repository and push if repository authorization is available; otherwise leave the code complete here and identify the single connection step needed.

## Technical details
- Use React Three Fiber with a client-only homepage, capped pixel density, a small procedural scene, delta-time animation, and no heavyweight downloaded models.
- Preserve the current self-contained course page at `/skillbridge.html` and mount it only after the opening.
