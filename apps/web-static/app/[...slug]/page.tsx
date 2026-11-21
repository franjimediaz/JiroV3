import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublication, getPublishedPage } from "../../lib/publication";
import { PublishedContent } from "../PublishedContent";

type PageProps = { params: Promise<{ slug: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return getPublication().pages
    .filter(({ page }) => page.path !== "/")
    .map(({ page }) => ({ slug: page.path.slice(1).split("/") }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const published = getPublishedPage(`/${slug.join("/")}`);
  if (!published) notFound();
  return { title: published.page.title, description: published.page.description };
}

export default async function PublishedPage({ params }: PageProps) {
  const { slug } = await params;
  const published = getPublishedPage(`/${slug.join("/")}`);
  if (!published) notFound();
  return <PublishedContent data={published.data} header={published.header} />;
}
