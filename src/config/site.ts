export const site = {
  name: "Lumora",
  tagline: "Discover the magic.",
  description:
    "An unofficial, fan-made 3D experience for exploring and casting spells from Harry Potter and the Philosopher’s Stone.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  disclaimer:
    "Lumora is an unofficial fan project. It is not affiliated with or endorsed by J.K. Rowling, Warner Bros., or Wizarding World Digital. All 3D art, sound, and writing here are original.",
} as const;
