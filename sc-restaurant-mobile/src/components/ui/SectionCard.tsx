import type { ReactNode } from "react";
import React from "react";

import { SurfacePanel } from "@/src/components/ui/SurfacePanel";

export function SectionCard({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return <SurfacePanel compact={compact}>{children}</SurfacePanel>;
}
