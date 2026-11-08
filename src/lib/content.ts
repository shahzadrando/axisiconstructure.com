export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  category: string;
  categorySlug: string;
  publishedAt: string;
  updatedAt?: string;
  bodyHtml: string;
  draft: boolean;
}

interface MarkdownFile {
  frontmatter: Omit<Post, 'slug' | 'bodyHtml' | 'categorySlug'>;
  compiledContent(): string | Promise<string>;
}

const files = import.meta.glob<MarkdownFile>('../content/blog/*.md', { eager: true });
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Posts come from src/content/blog. Drafts appear only when SHOW_DRAFTS=true. */
export async function getPosts(): Promise<Post[]> {
  const posts = await Promise.all(Object.entries(files).map(async ([file, md]) => ({
    ...md.frontmatter,
    draft: md.frontmatter.draft === true,
    slug: file.split('/').pop()!.replace(/\.md$/, ''),
    categorySlug: slugify(md.frontmatter.category),
    publishedAt: new Date(md.frontmatter.publishedAt).toISOString(),
    bodyHtml: await md.compiledContent(),
  })));
  return posts
    .filter((p) => !p.draft || process.env.SHOW_DRAFTS === 'true')
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
