import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/navigation/SiteHeader";

/** Full-screen 3D pages: the header floats over the canvas, and there is no footer. */
export default function ChamberLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader overlay />
      <main id="main" className="flex-1">
        {children}
      </main>
      <p className="sr-only">
        Lumora is an unofficial fan project. <Link href="/about">About this project</Link>
      </p>
    </>
  );
}
