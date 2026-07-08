// mdx-annotations ships no types; the three plugins are documented in its
// README (remarkPlugins / rehypePlugins / recmaPlugins respectively).
declare module "mdx-annotations" {
  import type { Plugin } from "unified";

  export const mdxAnnotations: {
    remark: Plugin;
    rehype: Plugin;
    recma: Plugin;
  };
}
