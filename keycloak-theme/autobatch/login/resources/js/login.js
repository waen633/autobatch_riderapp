(() => {
  function ensureContactButton() {
    if (document.querySelector('.ab-login-contact')) return;
    const button = document.createElement('button');
    button.className = 'ab-login-contact';
    button.type = 'button';
    button.textContent = 'Contact';
    button.setAttribute('aria-label', 'Contact');
    document.body.appendChild(button);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureContactButton);
  } else {
    ensureContactButton();
  }
})();
