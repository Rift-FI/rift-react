// Best-effort: match the host page's theme so the modal blends in
// instead of flashing white over a dark site. Checks data-theme, the
// `dark` class convention, then system preference.
export function detectHostTheme(): "light" | "dark" | null {
  if (typeof document === "undefined") return null;
  const html = document.documentElement;
  const attr = html.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  if (html.classList.contains("dark") || document.body?.classList.contains("dark")) {
    return "dark";
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return null;
}
