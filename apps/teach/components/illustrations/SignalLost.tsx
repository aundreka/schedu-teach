import React from "react";
import Svg, { Path, Line, Circle, Ellipse } from "react-native-svg";
import { useIllustrationPalette, type IllustrationProps } from "./palette";

/** Error / offline: a cloud with a gap in its connection. Pairs with a retry CTA. */
export default function SignalLost({ size = 240 }: IllustrationProps) {
  const p = useIllustrationPalette();
  return (
    <Svg width={size} height={(size * 5) / 6} viewBox="0 0 240 200" fill="none">
      <Ellipse cx="120" cy="176" rx="52" ry="6" fill={p.shadow} />

      {/* cloud */}
      <Path
        d="M78 106
           a22 22 0 0 1 4 -43.6
           a30 30 0 0 1 57.5 -7.4
           a24 24 0 0 1 22.5 24
           a20 20 0 0 1 -6 27
           z"
        fill={p.paper}
        stroke={p.stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <Path d="M92 84 q10 8 24 6" stroke={p.faint} strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* connection with a gap */}
      <Line x1="120" y1="114" x2="120" y2="130" stroke={p.stroke} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="120" y1="144" x2="120" y2="156" stroke={p.stroke} strokeWidth="2.5" strokeLinecap="round" />

      {/* spark at the break */}
      <Path d="M132 131 l-7 8 h6 l-7 8" stroke={p.amber} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* endpoint */}
      <Circle cx="120" cy="165" r="6.5" fill="none" stroke={p.stroke} strokeWidth="2.5" />

      {/* ambient dots */}
      <Circle cx="58" cy="60" r="2.4" fill={p.faint} />
      <Circle cx="186" cy="52" r="3" fill="none" stroke={p.faint} strokeWidth="2" />
      <Circle cx="176" cy="118" r="2.2" fill={p.faint} />
    </Svg>
  );
}
