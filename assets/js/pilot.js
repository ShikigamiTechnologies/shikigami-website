// Homepage navigation and controlled-pilot intake.
document.addEventListener('DOMContentLoaded', function () {
  var navToggle = document.querySelector('.home-nav-toggle');
  var navLinks = document.getElementById('home-nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var open = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!open));
      navLinks.classList.toggle('is-open', !open);
    });
    navLinks.addEventListener('click', function (event) {
      if (event.target.closest('a')) {
        navToggle.setAttribute('aria-expanded', 'false');
        navLinks.classList.remove('is-open');
      }
    });
  }

  var form = document.getElementById('pilot-form');
  var wrap = document.getElementById('pilot-form-wrap');
  var done = document.getElementById('pilot-success');
  var reset = document.getElementById('pilot-reset');
  var status = document.getElementById('pilot-status');
  var reference = document.getElementById('pilot-reference');
  if (!form || !wrap || !done) return;
  form.elements.started_at.value = Date.now();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    var data = new FormData(form);
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Sending securely…';
    status.textContent = 'Recording your bounded scoping request…';
    try {
      var response = await fetch('/api/pilot-interest', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          organization: String(data.get('org') || '').trim(),
          role: String(data.get('role') || '').trim(),
          workflow: String(data.get('workflow') || '').trim(),
          email: String(data.get('email') || '').trim(),
          website: String(data.get('website') || ''),
          started_at: Number(data.get('started_at') || 0)
        })
      });
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.message || 'The request could not be submitted.');
      form.reset();
      form.elements.started_at.value = Date.now();
      reference.textContent = result.reference ? 'Reference: ' + result.reference : '';
      wrap.style.display = 'none';
      done.style.display = 'block';
      done.focus();
    } catch (error) {
      status.textContent = error.message + ' You may also email tengen@shikigamitechnologies.com.';
      button.disabled = false;
      button.textContent = 'Request a scoping conversation';
    }
  });

  if (reset) reset.addEventListener('click', function () {
    form.reset();
    done.style.display = 'none';
    wrap.style.display = 'block';
  });
});
