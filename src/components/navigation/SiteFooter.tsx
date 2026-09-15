import { site } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-5 pt-16 pb-10 sm:px-8">
      <hr className="mb-6 rule-gilt" />
      <p className="max-w-2xl text-sm text-vellum">{site.disclaimer}</p>
    </footer>
  );
}
