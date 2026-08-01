/* PUPSync landing — quiz + store CTA orchestration */

(() => {
  const STORE_URL = ""; // paste Chrome Web Store URL when published
  const GITHUB_URL = "https://github.com/troy-ll/Pupsync";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // —— Store CTAs ——
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

  // —— Hero text reveal ——
  const heroLines = document.getElementById("hero-lines");
  if (heroLines) {
    requestAnimationFrame(() => {
      heroLines.classList.add("is-shown");
    });
  }

  // —— Checkbox path lengths ——
  document.querySelectorAll(".t-check svg path").forEach((path) => {
    const len = Math.ceil(path.getTotalLength()) + 1;
    path.closest(".t-check")?.style.setProperty("--check-len", String(len));
  });

  // —— Quiz ——
  const answers = { 1: null, 2: null, 3: null };
  const verdict = document.getElementById("verdict");
  const verdictText = document.getElementById("verdict-text");
  const verdictBody = document.getElementById("verdict-body");
  const quizHint = document.getElementById("quiz-hint");

  const verdicts = {
    mostlyA: {
      line: "You’re the “screenshot SIAS and pray” student.",
      body: "PUPSync turns that screenshot habit into a real calendar — and a calmer Latin check.",
    },
    mostlyB: {
      line: "You’re the friend-group logistics officer.",
      body: "Import the week, share a clean grid or standing glance, keep the transcript drama offline.",
    },
    mostlyC: {
      line: "You’re raw-dogging the semester. Respectfully.",
      body: "This is the low-friction loop: sync once, glance standing, stay a little more motivated.",
    },
    mixed: {
      line: "You’re the student PUPSync was built for.",
      body: "Schedule into Calendar. GWA standing without the spiral. Share the clean cut; keep the rest.",
    },
  };

  function pickVerdict() {
    const vals = Object.values(answers);
    if (vals.some((v) => !v)) return null;
    const counts = { A: 0, B: 0, C: 0 };
    vals.forEach((v) => {
      counts[v] += 1;
    });
    if (counts.A >= 2) return verdicts.mostlyA;
    if (counts.B >= 2) return verdicts.mostlyB;
    if (counts.C >= 2) return verdicts.mostlyC;
    return verdicts.mixed;
  }

  function swapText(el, next) {
    if (!el) return;
    if (reduceMotion) {
      el.textContent = next;
      return;
    }
    const dur =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--text-swap-dur")) ||
      150;
    el.classList.add("is-exit");
    window.setTimeout(() => {
      el.textContent = next;
      el.classList.remove("is-exit");
      el.classList.add("is-enter-start");
      void el.offsetWidth;
      el.classList.remove("is-enter-start");
    }, dur);
  }

  function maybeShowVerdict() {
    const pick = pickVerdict();
    if (!pick || !verdict) return;
    verdict.hidden = false;
    verdict.classList.add("is-open");
    quizHint?.classList.add("is-done");
    swapText(verdictText, pick.line);
    if (verdictBody) verdictBody.textContent = pick.body;
    verdict.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }

  document.querySelectorAll(".q").forEach((fieldset) => {
    const q = fieldset.getAttribute("data-q");
    fieldset.querySelectorAll(".t-check").forEach((btn) => {
      btn.addEventListener("click", () => {
        fieldset.querySelectorAll(".t-check").forEach((other) => {
          other.setAttribute("aria-checked", "false");
        });
        btn.setAttribute("aria-checked", "true");
        answers[q] = btn.getAttribute("data-value");
        maybeShowVerdict();
      });
    });

    // Clicking the label row also toggles
    fieldset.querySelectorAll(".opt").forEach((label) => {
      label.addEventListener("click", (e) => {
        if (e.target.closest(".t-check")) return;
        label.querySelector(".t-check")?.click();
      });
    });
  });
})();
