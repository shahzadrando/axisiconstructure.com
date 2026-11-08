export {};

const form = document.getElementById('contactForm') as HTMLFormElement;
const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const status = form.querySelector<HTMLElement>('.form-status')!;
const slot = form.querySelector<HTMLElement>('.cf-turnstile-slot')!;
const hint = form.querySelector<HTMLElement>('#submit-hint');
const fileInput = form.querySelector<HTMLInputElement>('#boq');
const fileName = form.querySelector<HTMLElement>('#file-name-display');
const MAX_FILE = 10 * 1024 * 1024;

declare global {
  interface Window {
    turnstile?: { render(el: HTMLElement, options: object): string; reset(id?: string): void };
  }
}

let widget: string | undefined;

const show = (message: string, isError: boolean) => {
  status.textContent = message;
  status.hidden = false;
  status.classList.toggle('is-error', isError);
};

// Loaded on first use so visitors who never touch the form do not pay for it.
function loadTurnstile() {
  if (document.getElementById('turnstile-api')) return;
  const script = document.createElement('script');
  script.id = 'turnstile-api';
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.onload = () => {
    widget = window.turnstile?.render(slot, { sitekey: slot.dataset.sitekey, callback: () => { submit.disabled = false; if (hint) hint.hidden = true; } });
  };
  script.onerror = () => show('The security check could not load. Please contact us by WhatsApp or email.', true);
  document.head.appendChild(script);
}

form.addEventListener('focusin', loadTurnstile);
form.addEventListener('pointerdown', loadTurnstile);

fileInput?.addEventListener('change', () => {
  if (!fileName) return;
  const file = fileInput.files?.[0];
  fileName.replaceChildren();
  fileName.style.display = file ? 'flex' : 'none';
  if (!file) return;
  const icon = document.createElement('i');
  icon.className = 'ph ph-file-text';
  const name = document.createElement('strong');
  name.textContent = file.name;
  fileName.append(icon, ' Selected: ', name, ` (${(file.size / 1048576).toFixed(2)} MB)`);
  if (file.size > MAX_FILE) show('Attachments can be up to 10 MB.', true);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const original = submit.innerHTML;
  submit.disabled = true;
  submit.textContent = 'Sending...';
  status.hidden = true;
  let result = { ok: false, message: 'We could not send your inquiry. Please try again, or contact us on WhatsApp or by email.' };
  try {
    const response = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { accept: 'application/json' } });
    result = await response.json();
  } catch {
    // The default failure message above is shown.
  }
  submit.innerHTML = original;
  show(result.message, !result.ok);
  if (result.ok) {
    form.reset();
    if (fileName) { fileName.replaceChildren(); fileName.style.display = 'none'; }
  }
  window.turnstile?.reset(widget);
  submit.disabled = true;
  if (hint) hint.hidden = false;
});
