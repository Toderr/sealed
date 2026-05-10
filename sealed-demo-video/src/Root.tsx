import React from "react";
import { Composition } from "remotion";
import { SealedDemo } from "./SealedDemo";

export const Root: React.FC = () => {
  return (
    <Composition
      id="SealedDemo"
      component={SealedDemo}
      durationInFrames={4500}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
