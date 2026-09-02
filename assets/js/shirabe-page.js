(() => {
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
