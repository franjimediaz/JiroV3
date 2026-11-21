import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPage } from "../lib/publication";
import { PublishedContent } from "./PublishedContent";

export function generateMetadata(): Metadata {
  const published = getPublishedPage("/");
  if (!published) notFound();
  return { title: published.page.title, description: published.page.description };
}

export default function Home() {
  const published = getPublishedPage("/");
  if (!published) notFound();
  return <PublishedContent data={published.data} header={published.header} />;
}
