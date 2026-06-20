export type LegacyDifficulty = "easy" | "medium" | "hard";

export function deriveLessonComplexityScore(input: {
  title?: string | null;
  content?: string | null;
  learningObjectives?: string | null;
}): number {
  const text = [input.title, input.content, input.learningObjectives]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!text) return 3;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 180) return 5;
  if (wordCount >= 100) return 4;
  if (wordCount >= 40) return 3;
  if (wordCount >= 15) return 2;
  return 1;
}

export function complexityScoreToEstimatedMinutes(score: number): number {
  if (score >= 5) return 120;
  if (score >= 4) return 90;
  if (score >= 3) return 60;
  if (score >= 2) return 45;
  return 30;
}

export function complexityScoreToDifficulty(score: number): LegacyDifficulty {
  if (score >= 4) return "hard";
  if (score >= 2) return "medium";
  return "easy";
}
