(() => {
  const service = document.body.classList.contains("shirabe-service");
  if (service) {
    const pageProgress = document.createElement("div");
    pageProgress.className = "sh-page-progress";
    pageProgress.setAttribute("aria-hidden", "true");
    document.body.prepend(pageProgress);

    const updatePageProgress = () => {
      const root = document.scrollingElement || document.documentElement;
      const range = root.scrollHeight - root.clientHeight;
      pageProgress.style.width = `${range > 0 ? (root.scrollTop / range) * 100 : 0}%`;
    };
    addEventListener("scroll", updatePageProgress, { passive: true });
    addEventListener("resize", updatePageProgress);
    updatePageProgress();

    const canvas = document.querySelector(".sh-graph");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (canvas && !reduced) {
      const context = canvas.getContext("2d");
      const pointer = { x: -999, y: -999 };
      const nodes = [];
      const pulses = [];
      let width = 0;
      let height = 0;
      let visible = true;
      let animationFrame = 0;

      const resizeCanvas = () => {
        const bounds = canvas.getBoundingClientRect();
        const ratio = Math.min(devicePixelRatio || 1, 2);
        width = bounds.width;
        height = bounds.height;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        nodes.length = 0;
        const columns = width < 760 ? 5 : 7;
        const rows = width < 760 ? 6 : 5;
        for (let column = 0; column < columns; column += 1) {
          for (let row = 0; row < rows; row += 1) {
            const x = (width / (columns - 1)) * column;
            const y = (height / (rows - 1)) * row;
            nodes.push({ x, y, originX: x, originY: y, phase: Math.random() * Math.PI * 2, radius: 1.1 + Math.random() * 1.5 });
          }
        }
      };
      const movePointer = (event) => {
        const bounds = canvas.getBoundingClientRect();
        pointer.x = event.clientX - bounds.left;
        pointer.y = event.clientY - bounds.top;
      };
      resizeCanvas();
      addEventListener("resize", resizeCanvas);
      addEventListener("mousemove", movePointer, { passive: true });
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0 }).observe(canvas);

      const spawnPulse = () => {
        const from = nodes[Math.floor(Math.random() * nodes.length)];
        const nearby = nodes.filter((node) => node !== from && Math.hypot(node.x - from.x, node.y - from.y) < width / 5);
        const to = nearby[Math.floor(Math.random() * nearby.length)];
        if (to) pulses.push({ from, to, progress: 0, speed: .005 + Math.random() * .007 });
      };
      let lastPaint = 0;
      const paint = (timestamp) => {
        animationFrame = requestAnimationFrame(paint);
        if (!visible || timestamp - lastPaint < 16) return;
        lastPaint = timestamp;
        const time = timestamp / 1000;
        const linkDistance = width / 5.2;
        context.clearRect(0, 0, width, height);
        nodes.forEach((node) => {
          const dx = node.originX - pointer.x;
          const dy = node.originY - pointer.y;
          const distance = Math.hypot(dx, dy) || 1;
          const pull = distance < 190 ? (1 - distance / 190) * 24 : 0;
          node.x = node.originX + Math.sin(time * .5 + node.phase) * 6 - (dx / distance) * pull;
          node.y = node.originY + Math.cos(time * .42 + node.phase) * 6 - (dy / distance) * pull;
        });
        context.lineWidth = 1;
        nodes.forEach((from, first) => nodes.slice(first + 1).forEach((to) => {
          const distance = Math.hypot(from.x - to.x, from.y - to.y);
          if (distance < linkDistance) {
            context.strokeStyle = `rgba(111,211,224,${(.15 * (1 - distance / linkDistance)).toFixed(3)})`;
            context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
          }
        }));
        nodes.forEach((node) => {
          const near = Math.hypot(node.x - pointer.x, node.y - pointer.y) < 150;
          context.fillStyle = near ? "rgba(111,211,224,.92)" : "rgba(221,230,239,.36)";
          context.beginPath(); context.arc(node.x, node.y, node.radius, 0, Math.PI * 2); context.fill();
        });
        if (Math.random() < .07 && pulses.length < 12) spawnPulse();
        for (let index = pulses.length - 1; index >= 0; index -= 1) {
          const pulse = pulses[index];
          pulse.progress += pulse.speed;
          if (pulse.progress >= 1) { pulses.splice(index, 1); continue; }
          const x = pulse.from.x + (pulse.to.x - pulse.from.x) * pulse.progress;
          const y = pulse.from.y + (pulse.to.y - pulse.from.y) * pulse.progress;
          const fade = Math.sin(pulse.progress * Math.PI);
          context.fillStyle = `rgba(111,211,224,${(.9 * fade).toFixed(3)})`;
          context.beginPath(); context.arc(x, y, 2.3, 0, Math.PI * 2); context.fill();
        }
      };
      animationFrame = requestAnimationFrame(paint);
      addEventListener("pagehide", () => cancelAnimationFrame(animationFrame), { once: true });
    }
  }

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
