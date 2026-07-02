import React from "react";
import Svg, { Defs, LinearGradient, Stop, Rect, Line, Path, Circle, G, Ellipse } from "react-native-svg";
import { useIllustrationPalette, type IllustrationProps } from "./palette";

/**
 * No plans yet / first-run: a tilted calendar sheet with session blocks
 * dropping into place — the auto-scheduling pitch as a picture.
 */
export default function PlanSeed({ size = 240 }: IllustrationProps) {
  const p = useIllustrationPalette();
  return (
    <Svg width={size} height={(size * 5) / 6} viewBox="0 0 240 200" fill="none">
      <Defs>
        <LinearGradient id="seed-green" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.green} />
          <Stop offset="1" stopColor={p.greenDeep} />
        </LinearGradient>
      </Defs>

      <Ellipse cx="120" cy="176" rx="78" ry="7" fill={p.shadow} />

      <G rotation="-6" origin="120, 110">
        {/* header band */}
        <Rect x="52" y="58" width="136" height="30" rx="14" fill="url(#seed-green)" />
        <Rect x="52" y="74" width="136" height="14" fill="url(#seed-green)" />
        {/* sheet body */}
        <Rect x="52" y="88" width="136" height="74" fill={p.paper} />
        {/* grid */}
        <Line x1="97" y1="88" x2="97" y2="162" stroke={p.faint} strokeWidth="2" />
        <Line x1="142" y1="88" x2="142" y2="162" stroke={p.faint} strokeWidth="2" />
        <Line x1="52" y1="125" x2="188" y2="125" stroke={p.faint} strokeWidth="2" />
        {/* placed session blocks */}
        <Rect x="60" y="96" width="30" height="21" rx="6" fill="url(#seed-green)" />
        <Rect x="150" y="133" width="30" height="21" rx="6" fill={p.skySoft} stroke={p.sky} strokeWidth="2" />
        {/* holiday dot, skipped over */}
        <Circle cx="120" cy="143" r="5" fill={p.coral} />
        <Path d="M104 132 q16 -14 32 0" stroke={p.coralSoft} strokeWidth="2.5" strokeLinecap="round" fill="none" />
        {/* outline on top */}
        <Rect x="52" y="58" width="136" height="104" rx="14" fill="none" stroke={p.stroke} strokeWidth="2" />
        {/* binder rings */}
        <Rect x="84" y="48" width="6" height="16" rx="3" fill={p.stroke} />
        <Rect x="150" y="48" width="6" height="16" rx="3" fill={p.stroke} />
      </G>

      {/* block dropping in */}
      <Rect x="142" y="16" width="32" height="22" rx="6" fill="url(#seed-green)" />
      <Line x1="150" y1="8" x2="150" y2="12" stroke={p.green} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="162" y1="4" x2="162" y2="10" stroke={p.green} strokeWidth="2.5" strokeLinecap="round" />

      {/* sparkle */}
      <Path d="M206 44 q2 6 8 8 q-6 2 -8 8 q-2 -6 -8 -8 q6 -2 8 -8 z" fill={p.amber} />
      <Circle cx="36" cy="70" r="2.4" fill={p.faint} />
    </Svg>
  );
}
