import type { MDXComponents } from "mdx/types";
import { Menu } from "./menu";
import { WikiLink } from "./wiki-link";

// Component whitelist (ADR 0002): what page authors can call from MDX.
// Anything absent from this map renders nothing.
export const mdxComponents: MDXComponents = {
  Menu,
  a: WikiLink,
};
