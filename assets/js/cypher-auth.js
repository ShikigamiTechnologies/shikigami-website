(function () {
  const companyForm = document.getElementById('company-form');
  const loginForm = document.getElementById('login-form');
  const companySelect = document.getElementById('company');
  const companyButton = companyForm.querySelector('button[type="submit"]');
  const progress = document.querySelectorAll('.auth-progress i');
  let companies = [];

  function message(id, text) {
    const node = document.getElementById(id);
    node.textContent = text || '';
    node.hidden = !text;
  }
  async function responseJson(response) {
    try { return await response.json(); } catch (_) { return {}; }
  }
  async function loadCompanies() {
    try {
      const response = await fetch('/api/cypher/v1/companies', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.message || 'Companies are temporarily unavailable.');
      companies = data.companies || [];
      companySelect.innerHTML = '<option value="">Select your company</option>' + companies.map(function (company) {
        const option = document.createElement('option'); option.value = company.slug; option.textContent = company.display_name; return option.outerHTML;
      }).join('');
      companySelect.disabled = companies.length === 0;
      companyButton.disabled = companies.length === 0;
      if (!companies.length) message('company-error', 'No company workspaces are currently available. Contact Shikigami support.');
    } catch (error) {
      companySelect.innerHTML = '<option value="">Companies unavailable</option>';
      message('company-error', error.message);
    }
  }
  companyForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!companySelect.value) return;
    const company = companies.find(function (item) { return item.slug === companySelect.value; });
    document.getElementById('selected-company').textContent = company ? company.display_name : 'your company';
    companyForm.hidden = true; loginForm.hidden = false; progress[1].classList.add('active'); document.getElementById('email').focus();
  });
  document.getElementById('company-back').addEventListener('click', function () {
    loginForm.hidden = true; companyForm.hidden = false; progress[1].classList.remove('active'); message('login-error', '');
  });
  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault(); message('login-error', '');
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Signing in…';
    try {
      const response = await fetch('/api/cypher/v1/login', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ company: companySelect.value, email: document.getElementById('email').value, password: document.getElementById('password').value }) });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.message || 'Sign-in failed.');
      location.replace('/cypher-app.html');
    } catch (error) { message('login-error', error.message); }
    finally { button.disabled = false; button.textContent = 'Sign in securely'; }
  });
  fetch('/api/cypher/v1/session', { credentials: 'same-origin' }).then(function (response) { if (response.ok) location.replace('/cypher-app.html'); });
  loadCompanies();
}());
