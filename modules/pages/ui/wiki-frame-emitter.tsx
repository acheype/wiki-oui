"use client";

// The child half of WikiFrame's cross-origin sizing: rendered inside the
// chrome-free /{slug}/iframe page, it posts the render box's height — and the
// document title — to the framing parent. Same-origin parents ignore it (they
// read the DOM directly); a cross-origin WikiOui parent listens for it
// (WikiFrame's postMessage path). Neither is sensitive, so targetOrigin "*"
// is fine — the parent may be any WikiOui on any domain, whose origin the
// child cannot know in advance.
//
// The title lets a cross-origin container that has a title bar — the modal of
// a <WikiLink>/<Button> pointing here — name the fiche in its own bar (it
// cannot read our document.title cross-origin). Whether the body then repeats
// the title is the author's call: they add ?title=hidden to the URL to drop
// it, exactly as they write the /iframe suffix themselves.

import { useEffect } from "react";

export function WikiFrameResizeEmitter() {
  useEffect(() => {
    if (window.parent === window) return; // not framed: nobody to tell
    // The title (leading heading or slug, set by generateMetadata) is static
    // per load, so it is posted once — unlike the height, which is observed.
    if (document.title) {
      window.parent.postMessage(
        { type: "wikioui:title", version: 1, title: document.title },
        "*"
      );
    }
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
