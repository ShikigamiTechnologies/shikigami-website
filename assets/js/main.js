// Scroll-reveal animation for elements with class="reveal"
// (converted from the design export's React/DCLogic component)
document.addEventListener('DOMContentLoaded', function () {
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  var reveals = document.querySelectorAll('.reveal');
  reveals.forEach(function (el, i) {
    el.style.transitionDelay = (Math.min(i % 4, 3) * 0.08) + 's';
    io.observe(el);
  });
});
