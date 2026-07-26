import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

/**
 * Root-relative image/link paths in markdown (e.g. `/notices/foo/photo.png`) need the
 * GitHub Pages basePath prepended, since the site may be served from a subpath.
 */
function rehypeBasePath(basePath: string) {
  return (tree: Root) => {
    if (!basePath) return;
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "img" && node.tagName !== "a") return;
      const attr = node.tagName === "img" ? "src" : "href";
      const value = node.properties?.[attr];
      if (typeof value === "string" && value.startsWith("/")) {
        node.properties[attr] = `${basePath}${value}`;
      }
    });
  };
}

export async function markdownToHtml(markdown: string): Promise<string> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const result = await remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeBasePath, basePath)
    .use(rehypeStringify)
    .process(markdown);

  return result.toString();
}
