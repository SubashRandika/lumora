import type { ReactNode } from "react";
import { PageShell } from "@/components/navigation/PageShell";

export default function PagesLayout({ children }: { children: ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
