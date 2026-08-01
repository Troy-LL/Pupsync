/* PUPSync landing — CTA + hero reveal */

(() => {
  const STORE_URL = ""; // paste Chrome Web Store URL when published
  const GITHUB_URL = "https://github.com/troy-ll/Pupsync";

  document.querySelectorAll("[data-store]").forEach((el) => {
    if (STORE_URL) {
      el.setAttribute("href", STORE_URL);
      el.setAttribute("rel", "noopener");
      el.setAttribute("target", "_blank");
    } else {
      el.addEventListener("click", (e) => {
        if (el.getAttribute("href") === "#install") return;
        e.preventDefault();
        window.open(GITHUB_URL, "_blank", "noopener");
      });
    }
  });

  const heroLines = document.getElementById("hero-lines");
  if (heroLines) {
    requestAnimationFrame(() => heroLines.classList.add("is-shown"));
  }
})();
