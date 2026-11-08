import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Render, webPuckConfig } from "@repo/web-puck";
import { getPublishedPage } from "../lib/publication";

export function generateMetadata(): Metadata {
  const published = getPublishedPage("/");
  if (!published) notFound();
  return { title: published.page.title, description: published.page.description };
}

export default function Home() {
  const published = getPublishedPage("/");
  if (!published) notFound();
  return <Render config={webPuckConfig} data={published.data} />;
}
