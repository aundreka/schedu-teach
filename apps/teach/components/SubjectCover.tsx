import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path, Rect } from "react-native-svg";

/**
 * Generative cover art for subject cards: a gradient of the subject's color
 * overlaid with a low-opacity geometric pattern seeded by the subject id —
 * deterministic per subject (stable across renders/devices), unique across
 * subjects, cohesive as a set. Used when the teacher hasn't uploaded a cover.
 */

type Props = {
  /** Stable seed — pass the subject id. */
  seed: string;
  title: string;
  code?: string;
  /** Subject accent color (hex). */
  color: string;
  /** 0–1 term progress; renders the bottom hairline bar when provided. */
  progress?: number;
  width?: number;
  height?: number;
  radius?: number;
};

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((ch) => ch + ch).join("") : m;
  const num = parseInt(full, 16);
  const mix = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amount))));
  const r = mix((num >> 16) & 255);
  const g = mix((num >> 8) & 255);
  const b = mix(num & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

type Shape = { kind: "ring" | "dot" | "arc" | "tri" | "plus"; x: number; y: number; r: number; rot: number; o: number };

function buildShapes(seed: string, w: number, h: number): Shape[] {
  const rand = mulberry32(hashSeed(seed));
  const kinds: Shape["kind"][] = ["ring", "dot", "arc", "tri", "plus"];
  const shapes: Shape[] = [];
  const count = 9 + Math.floor(rand() * 4);
  for (let i = 0; i < count; i++) {
    shapes.push({
      kind: kinds[Math.floor(rand() * kinds.length)],
      x: rand() * w,
      y: rand() * h * 0.72, // keep the title zone quiet
      r: 8 + rand() * 22,
      rot: rand() * 360,
      o: 0.09 + rand() * 0.1,
    });
  }
  return shapes;
}

function ShapeEl({ s }: { s: Shape }) {
  const common = { opacity: s.o, originX: s.x, originY: s.y, rotation: s.rot } as const;
  switch (s.kind) {
    case "ring":
      return <Circle cx={s.x} cy={s.y} r={s.r} stroke="#FFFFFF" strokeWidth={2} fill="none" {...common} />;
    case "dot":
      return <Circle cx={s.x} cy={s.y} r={s.r * 0.35} fill="#FFFFFF" {...common} />;
    case "arc":
      return (
        <Path
          d={`M ${s.x - s.r} ${s.y} a ${s.r} ${s.r} 0 0 1 ${s.r * 2} 0`}
          stroke="#FFFFFF"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          {...common}
        />
      );
    case "tri":
      return (
        <Path
          d={`M ${s.x} ${s.y - s.r} L ${s.x + s.r * 0.9} ${s.y + s.r * 0.6} L ${s.x - s.r * 0.9} ${s.y + s.r * 0.6} Z`}
          stroke="#FFFFFF"
          strokeWidth={2}
          strokeLinejoin="round"
          fill="none"
          {...common}
        />
      );
    case "plus":
      return (
        <Path
          d={`M ${s.x} ${s.y - s.r * 0.6} v ${s.r * 1.2} M ${s.x - s.r * 0.6} ${s.y} h ${s.r * 1.2}`}
          stroke="#FFFFFF"
          strokeWidth={2}
          strokeLinecap="round"
          {...common}
        />
      );
  }
}

export default function SubjectCover({
  seed,
  title,
  code,
  color,
  progress,
  width = 160,
  height = 200,
  radius = 20,
}: Props) {
  const shapes = useMemo(() => buildShapes(seed, width, height), [seed, width, height]);
  const top = useMemo(() => shade(color, 0.12), [color]);
  const bottom = useMemo(() => shade(color, -0.28), [color]);

  return (
    <View style={[styles.root, { width, height, borderRadius: radius }]}>
      <LinearGradient colors={[top, bottom]} start={{ x: 0.1, y: 0 }} end={{ x: 0.7, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {shapes.map((s, i) => (
          <ShapeEl key={i} s={s} />
        ))}
        {/* glyph: small calendar mark, top-left */}
        <Rect x={14} y={18} width={20} height={18} rx={5} stroke="#FFFFFF" strokeWidth={2} opacity={0.9} fill="none" />
        <Path d="M19 14 v5 M29 14 v5" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" opacity={0.9} />
        <Rect x={19} y={25} width={7} height={5} rx={2} fill="#FFFFFF" opacity={0.9} />
      </Svg>
      {/* legibility scrim */}
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.38)"]} style={styles.scrim} />
      <View style={styles.meta}>
        {!!code && (
          <Text style={styles.code} numberOfLines={1}>
            {code.toUpperCase()}
          </Text>
        )}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </View>
      {typeof progress === "number" && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: "hidden" },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 84 },
  meta: { position: "absolute", left: 14, right: 12, bottom: 12 },
  code: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  title: { color: "#FFFFFF", fontSize: 16, fontWeight: "700", lineHeight: 21 },
  track: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  fill: { height: 3, backgroundColor: "#FFFFFF", borderBottomRightRadius: 2 },
});
