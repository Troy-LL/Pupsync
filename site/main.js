/* PUPSync homepage CTAs */

(() => {
  const STORE_URL =
    "https://chromewebstore.google.com/detail/pupsync/lajkaclhliicgdfdlnfioaodjnkjmedp";

  document.querySelectorAll("[data-store]").forEach((el) => {
    el.setAttribute("href", STORE_URL);
    el.setAttribute("rel", "noopener");
    el.setAttribute("target", "_blank");
  });
})();
