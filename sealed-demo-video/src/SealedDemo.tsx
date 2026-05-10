import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { COLORS } from "./theme";
import { SceneHook } from "./scenes/SceneHook";
import { SceneProblem } from "./scenes/SceneProblem";
import { SceneSolution } from "./scenes/SceneSolution";
import { SceneDemoChat } from "./scenes/SceneDemoChat";
import { SceneDemoNegotiate } from "./scenes/SceneDemoNegotiate";
import { SceneDemoOnchain } from "./scenes/SceneDemoOnchain";
import { SceneTraction } from "./scenes/SceneTraction";
import { SceneCTA } from "./scenes/SceneCTA";

// Total: 4500 frames @ 30fps = 150s = 2:30
// Scene durations (frames):
// 1. Hook       450  (15s)
// 2. Problem    750  (25s)
// 3. Solution   750  (25s)
// 4. DemoChat   750  (25s)
// 5. DemoNeg    600  (20s)
// 6. DemoOnchain 450 (15s)
// 7. Traction   450  (15s)
// 8. CTA        300  (10s)

export const SealedDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <Series>
        <Series.Sequence durationInFrames={450}>
          <SceneHook />
        </Series.Sequence>
        <Series.Sequence durationInFrames={750}>
          <SceneProblem />
        </Series.Sequence>
        <Series.Sequence durationInFrames={750}>
          <SceneSolution />
        </Series.Sequence>
        <Series.Sequence durationInFrames={750}>
          <SceneDemoChat />
        </Series.Sequence>
        <Series.Sequence durationInFrames={600}>
          <SceneDemoNegotiate />
        </Series.Sequence>
        <Series.Sequence durationInFrames={450}>
          <SceneDemoOnchain />
        </Series.Sequence>
        <Series.Sequence durationInFrames={450}>
          <SceneTraction />
        </Series.Sequence>
        <Series.Sequence durationInFrames={300}>
          <SceneCTA />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
