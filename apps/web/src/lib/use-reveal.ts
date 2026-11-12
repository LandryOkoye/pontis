import { useEffect, useRef } from "react";

/** Marks `.reveal` descendants as in view once, as they scroll into the viewport. */
export function useReveal<T extends HTMLElement>() {
  const root = useRef<T>(null);
  useEffect(() => {
    const nodes = root.current?.querySelectorAll<HTMLElement>(".reveal") ?? [];
    if (!("IntersectionObserver" in window)) {
      nodes.forEach((node) => (node.dataset.in = "true"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.in = "true";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  return root;
}
