"use client";

// The child half of WikiFrame's cross-origin sizing: rendered inside the
// chrome-free /{slug}/iframe page, it posts the render box's height to the
// framing parent. Same-origin parents ignore it (they read the DOM directly);
// a cross-origin WikiOui parent listens for it (WikiFrame's postMessage path).
// The height is not sensitive, so targetOrigin "*" is fine — the parent may be
// any WikiOui on any domain, whose origin the child cannot know in advance.

import { useEffect } from "react";

export function WikiFrameResizeEmitter() {
  useEffect(() => {
    if (window.parent === window) return; // not framed: nobody to tell
    const box = document.querySelector<HTMLElement>("[data-wiki-frame]");
    if (!box) return;
    const post = () =>
      window.parent.postMessage(
        {
          type: "wikioui:resize",
          version: 1,
          height: box.getBoundingClientRect().height,
        },
        "*"
      );
    post();
    const observer = new ResizeObserver(post);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return null;
}
