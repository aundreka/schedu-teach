import React from "react";
import EmptyState from "./EmptyState";
import { SignalLost } from "../illustrations";

type Props = {
  title?: string;
  body?: string;
  onRetry?: () => void;
  compact?: boolean;
};

/**
 * The standard error state: honest, illustrated, retryable. Use this instead
 * of silent fallbacks or demo data whenever a load fails.
 */
export default function ErrorState({
  title = "Something went wrong",
  body = "Check your connection and try again.",
  onRetry,
  compact = false,
}: Props) {
  return (
    <EmptyState
      illustration={<SignalLost size={compact ? 150 : 210} />}
      title={title}
      body={body}
      ctaLabel={onRetry ? "Retry" : undefined}
      onCta={onRetry}
    />
  );
}
