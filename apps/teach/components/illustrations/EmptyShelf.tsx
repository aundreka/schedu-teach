import React from "react";
import Svg, { Defs, LinearGradient, Stop, Rect, Line, Path, Circle, G, Ellipse } from "react-native-svg";
import { useIllustrationPalette, type IllustrationProps } from "./palette";

/** Empty library / no subjects yet: three friendly book spines on a shelf. */
export default function EmptyShelf({ size = 240 }: IllustrationProps) {
  const p = useIllustrationPalette();
  return (
    <Svg width={size} height={(size * 5) / 6} viewBox="0 0 240 200" fill="none">
      <Defs>
        <LinearGradient id="shelf-green" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.green} />
          <Stop offset="1" stopColor={p.greenDeep} />
        </LinearGradient>
      </Defs>

      <Ellipse cx="122" cy="168" rx="72" ry="7" fill={p.shadow} />

      {/* left book */}
      <Rect x="72" y="78" width="26" height="85" rx="6" fill={p.skySoft} stroke={p.stroke} strokeWidth="2" />
      <Line x1="80" y1="90" x2="80" y2="151" stroke={p.sky} strokeWidth="2" strokeLinecap="round" />

      {/* center book (brand) with calendar glyph */}
      <Rect x="104" y="64" width="32" height="99" rx="7" fill="url(#shelf-green)" stroke={p.greenDeep} strokeWidth="2" />
      <Rect x="111" y="98" width="18" height="17" rx="4" fill={p.paper} />
      <Rect x="114" y="94" width="3.5" height="7" rx="1.75" fill={p.paper} />
      <Rect x="122.5" y="94" width="3.5" height="7" rx="1.75" fill={p.paper} />
      <Line x1="114" y1="105" x2="126" y2="105" stroke={p.green} strokeWidth="2" strokeLinecap="round" />
      <Circle cx="117" cy="110" r="1.6" fill={p.green} />
      <Circle cx="123" cy="110" r="1.6" fill={p.green} />

      {/* leaning book with bookmark */}
      <G rotation="9" origin="155, 118">
        <Rect x="142" y="74" width="26" height="89" rx="6" fill={p.amberSoft} stroke={p.stroke} strokeWidth="2" />
        <Path d="M148 74 v16 l5 -5 l5 5 v-16 z" fill={p.amber} />
      </G>

      {/* shelf */}
      <Line x1="45" y1="163" x2="195" y2="163" stroke={p.stroke} strokeWidth="2.5" strokeLinecap="round" />

      {/* sparks */}
      <Path d="M178 46 v12 M172 52 h12" stroke={p.green} strokeWidth="2.5" strokeLinecap="round" />
      <Circle cx="62" cy="60" r="3" fill="none" stroke={p.faint} strokeWidth="2" />
      <Circle cx="192" cy="92" r="2.2" fill={p.faint} />
    </Svg>
  );
}
