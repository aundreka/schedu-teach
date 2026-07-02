import * as FileSystem from "expo-file-system/legacy";
import { formatEdgeFunctionError } from "./edge-function-errors";
import { supabase } from "./supabase";

/** Reports a human-readable extraction stage, e.g. "Reading text…". */
export type ExtractionProgress = (stage: string) => void;

export function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

export function guessMimeType(name: string, fallback?: string | null) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".txt")) return "text/plain";
  return fallback || "application/octet-stream";
}

async function readUriAsArrayBuffer(uri: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function uploadUriAsset(params: {
  uri: string;
  userId: string;
  fileName: string;
  mimeType: string;
  folder: string;
  /** Path segment under users/<id>/, e.g. "subjects" or "lessons". */
  scope: string;
}) {
  const { uri, userId, fileName, mimeType, folder, scope } = params;
  const safeName = sanitizeFileName(fileName);
  const path = `users/${userId}/${scope}/${folder}_${Date.now()}_${safeName}`;
  const body = await readUriAsArrayBuffer(uri);
  const { error } = await supabase.storage.from("uploads").upload(path, body, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

export async function extractPdfTextFromStoragePath(
  storagePath: string,
  onProgress?: ExtractionProgress
) {
  onProgress?.("Reading text…");
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const session = sessionData?.session;
  if (!session?.access_token) throw new Error("You must be signed in.");

  const { data, error, response } = await supabase.functions.invoke("extract-text", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: { storagePath },
  });

  if (error) {
    throw new Error(await formatEdgeFunctionError("extract-text", error, response));
  }

  onProgress?.("Cleaning up…");
  return String(data?.text ?? "");
}

export async function ocrImage(uri: string, onProgress?: ExtractionProgress): Promise<string> {
  try {
    onProgress?.("Reading text…");
    const mod = await import("react-native-mlkit-ocr");
    const result = await mod.default.detectFromUri(uri);
    if (typeof result === "string") return result;

    type OcrSegment = {
      text: string;
      x: number;
      y: number;
      h: number;
    };

    const segments: OcrSegment[] = [];
    const fallbackPieces: string[] = [];

    for (const block of result ?? []) {
      if (block?.lines?.length) {
        for (const line of block.lines) {
          if (!line?.text) continue;
          fallbackPieces.push(String(line.text).trim());
          const frame = (line as any)?.frame ?? {};
          segments.push({
            text: String(line.text).trim(),
            x: Number(frame?.x ?? 0),
            y: Number(frame?.y ?? 0),
            h: Number(frame?.height ?? 0),
          });
        }
        continue;
      }

      if (block?.text) {
        fallbackPieces.push(String(block.text).trim());
        const frame = (block as any)?.frame ?? {};
        segments.push({
          text: String(block.text).trim(),
          x: Number(frame?.x ?? 0),
          y: Number(frame?.y ?? 0),
          h: Number(frame?.height ?? 0),
        });
      }
    }

    if (segments.length === 0) return "";

    onProgress?.("Cleaning up…");
    const fallbackText = fallbackPieces.filter(Boolean).join("\n").trim();
    const positionedSegments = segments.filter(
      (segment) => Number.isFinite(segment.x) && Number.isFinite(segment.y) && (segment.x !== 0 || segment.y !== 0)
    );
    const distinctY = new Set(positionedSegments.map((segment) => Math.round(segment.y))).size;
    const canReliablySort = positionedSegments.length >= 4 && distinctY >= 3;
    if (!canReliablySort) {
      return fallbackText;
    }

    const avgHeight =
      segments.reduce((sum, segment) => sum + (segment.h > 0 ? segment.h : 18), 0) / segments.length;
    const rowTolerance = Math.max(10, Math.min(28, avgHeight * 0.65));

    segments.sort((a, b) => {
      if (Math.abs(a.y - b.y) > rowTolerance) return a.y - b.y;
      return a.x - b.x;
    });

    const rows: OcrSegment[][] = [];
    for (const segment of segments) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow) {
        rows.push([segment]);
        continue;
      }

      const rowY = lastRow.reduce((sum, item) => sum + item.y, 0) / lastRow.length;
      if (Math.abs(segment.y - rowY) <= rowTolerance) {
        lastRow.push(segment);
      } else {
        rows.push([segment]);
      }
    }

    const orderedLines = rows
      .map((row) =>
        row
          .sort((a, b) => a.x - b.x)
          .map((segment) => segment.text)
          .filter(Boolean)
          .join(" ")
          .replace(/[ ]{2,}/g, " ")
          .trim()
      )
      .filter((line) => line.length > 0);

    return orderedLines.join("\n").trim();
  } catch {
    throw new Error(
      "Image OCR needs a Dev Build (not Expo Go). Install react-native-mlkit-ocr and rebuild your app."
    );
  }
}
