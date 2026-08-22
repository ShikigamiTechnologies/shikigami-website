// Homepage navigation and controlled-pilot email handoff. No payload is transmitted by this page.
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
  if (!form || !wrap || !done) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(form);
    var subject = 'Controlled pilot scoping request — ' + String(data.get('org') || '').trim();
    var body = [
      'Organization: ' + String(data.get('org') || '').trim(),
      'Role: ' + String(data.get('role') || '').trim(),
      'Work email: ' + String(data.get('email') || '').trim(),
      '',
      'One workflow:',
      String(data.get('workflow') || '').trim(),
      '',
      'This message requests a scoping conversation only. It does not create a contract or authorize access to systems or data.'
    ].join('\n');
    wrap.style.display = 'none';
    done.style.display = 'block';
    done.focus();
    window.location.href = 'mailto:Tengen@shikigamitechnologies.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  });

  if (reset) reset.addEventListener('click', function () {
    form.reset();
    done.style.display = 'none';
    wrap.style.display = 'block';
  });
});
