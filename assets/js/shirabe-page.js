(() => {
  const menu = document.querySelector(".sh-menu");
  const mobileMenu = document.querySelector("#sh-mobile-menu");
  if (menu && mobileMenu) {
    const closeMenu = () => { menu.setAttribute("aria-expanded", "false"); mobileMenu.hidden = true; };
    menu.addEventListener("click", () => {
      const expanded = menu.getAttribute("aria-expanded") === "true";
      menu.setAttribute("aria-expanded", String(!expanded));
      mobileMenu.hidden = expanded;
    });
    mobileMenu.addEventListener("click", (event) => { if (event.target.closest("a")) closeMenu(); });
    addEventListener("resize", () => { if (innerWidth > 900) closeMenu(); });
  }

  const anchors = [...document.querySelectorAll("[data-sh-anchor]")];
  const sections = [...new Set(anchors.map((anchor) => document.querySelector(anchor.getAttribute("href"))).filter(Boolean))];
  if (anchors.length && sections.length) {
    const markLocation = () => {
      const marker = innerHeight * .32;
      let active = sections[0];
      sections.forEach((section) => { if (section.getBoundingClientRect().top <= marker) active = section; });
      anchors.forEach((anchor) => {
        if (anchor.getAttribute("href") === `#${active.id}`) anchor.setAttribute("aria-current", "location");
        else anchor.removeAttribute("aria-current");
      });
    };
    addEventListener("scroll", markLocation, { passive: true });
    addEventListener("resize", markLocation);
    markLocation();
  }

  const rail = document.querySelector("[data-method-rail]");
  if (!rail) return;
  const steps = [...rail.querySelectorAll(".process-step")];
  const current = rail.querySelector("[data-method-current]");
  const progress = rail.querySelector("[data-method-progress]");
  if (!steps.length || !current || !progress) return;

  const render = () => {
    const marker = window.innerHeight * 0.46;
    let active = 0;
    steps.forEach((step, index) => {
      if (step.getBoundingClientRect().top <= marker) active = index;
    });
    steps.forEach((step, index) => {
      const selected = index === active;
      step.classList.toggle("is-current", selected);
      if (selected) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
    current.textContent = String(active + 1).padStart(2, "0");
    progress.style.width = `${((active + 1) / steps.length) * 100}%`;
  };

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  };
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  render();
})();
