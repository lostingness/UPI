// Pre-paint theme script — runs in <head> before first paint so the
// correct theme class is on <html> before anything renders (no flash).
// Reads localStorage `upi-theme` ("light" | "dark"); falls back to
// prefers-color-scheme. No flash, no React involvement.
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem("upi-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`,
      }}
    />
  );
}
