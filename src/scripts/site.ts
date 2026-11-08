const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initHeader() {
  const header = document.getElementById('header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });
  requestAnimationFrame(onScroll);

  const button = header.querySelector<HTMLButtonElement>('.mobile-menu-btn');
  const nav = header.querySelector<HTMLElement>('.mobile-nav');
  if (!button || !nav) return;
  const setOpen = (open: boolean) => {
    nav.classList.toggle('active', open);
    button.setAttribute('aria-expanded', String(open));
    button.querySelector('i')!.className = open ? 'ph ph-x' : 'ph ph-list';
    if (!open) nav.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'));
  };
  button.addEventListener('click', () => setOpen(!nav.classList.contains('active')));
  nav.addEventListener('click', (event) => {
    const link = (event.target as Element).closest('a');
    if (!link) return;
    const item = link.parentElement;
    if (link.getAttribute('href') === '#' && item?.classList.contains('dropdown')) {
      event.preventDefault();
      const open = !item.classList.contains('open');
      nav.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'));
      item.classList.toggle('open', open);
      link.setAttribute('aria-expanded', String(open));
    } else {
      setOpen(false);
    }
  });
}

function initReveal() {
  const targets = document.querySelectorAll('.fade-in-up, .fade-in-left, .fade-in-right, .scale-in');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  targets.forEach((el) => observer.observe(el));
}

function initCounters() {
  if (reduceMotion) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      const el = entry.target as HTMLElement;
      const target = parseInt(el.dataset.target ?? '0', 10);
      const suffix = el.dataset.suffix ?? '';
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / 2000, 1);
        el.textContent = Math.floor(target * progress).toLocaleString('en-US') + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.counter-num').forEach((el) => observer.observe(el));
}

function initFaqs() {
  const toggle = (question: HTMLElement) => {
    const item = question.closest('.home-faq-item, .faq-item');
    if (!item) return;
    const open = !item.classList.contains('active');
    item.parentElement?.querySelectorAll('.home-faq-item, .faq-item').forEach((other) => {
      other.classList.remove('active');
      other.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
    });
    item.classList.toggle('active', open);
    question.setAttribute('aria-expanded', String(open));
  };
  document.querySelectorAll<HTMLElement>('.home-faq-question, .faq-question').forEach((question) => {
    question.addEventListener('click', () => toggle(question));
    question.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle(question);
    });
  });
}

function initAccordions() {
  const headers = document.querySelectorAll<HTMLElement>('.accordion-header');
  headers.forEach((header) => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      const content = item?.querySelector<HTMLElement>('.accordion-content');
      const open = item?.classList.contains('active');
      document.querySelectorAll('.accordion-item').forEach((other) => {
        other.classList.remove('active');
        const panel = other.querySelector<HTMLElement>('.accordion-content');
        if (panel) panel.style.maxHeight = '0';
      });
      if (!open && item && content) {
        item.classList.add('active');
        content.style.maxHeight = `${content.scrollHeight}px`;
      }
    });
  });
}

function initIconToggle() {
  document.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target.closest('#header')) return;
    const badge = target.closest('.vm-card-body .card-icon');
    if (badge) {
      badge.classList.toggle('active-gold-badge-global');
      return;
    }
    const icon = target.closest('.card-icon, .value-card > div:first-child, .service-card-icon-badge, .strip-grid-item')?.querySelector('i')
      ?? target.closest('i[class^="ph"], i[class*=" ph-"]');
    icon?.classList.toggle('active-gold-global');
  });
}

/** Draws the connecting road between timeline cards on narrow screens. */
function initTimeline() {
  const grid = document.querySelector<HTMLElement>('.timeline-grid-new');
  if (!grid) return;
  const svgNs = 'http://www.w3.org/2000/svg';
  const draw = () => {
    let svg = document.getElementById('mobile-snake-svg') as SVGSVGElement | null;
    if (window.innerWidth > 1200) {
      if (svg) svg.style.display = 'none';
      return;
    }
    if (!svg) {
      svg = document.createElementNS(svgNs, 'svg');
      svg.id = 'mobile-snake-svg';
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;top:0;left:0;z-index:1;pointer-events:none;overflow:visible';
      [['#0B8FC8', '12'], ['#0A192F', '8'], ['#ffffff', '2']].forEach(([stroke, width], i) => {
        const line = document.createElementNS(svgNs, 'path');
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', stroke);
        line.setAttribute('stroke-width', width);
        if (i === 2) {
          line.setAttribute('stroke-dasharray', '8, 8');
          line.style.animation = 'svg-snake-move 0.8s linear infinite';
        }
        svg!.appendChild(line);
      });
      grid.style.position = 'relative';
      grid.insertBefore(svg, grid.firstChild);
    }
    const box = grid.getBoundingClientRect();
    if (!box.width || !box.height) return;
    svg.style.display = 'block';
    svg.style.width = `${box.width}px`;
    svg.style.height = `${box.height}px`;
    svg.setAttribute('width', String(box.width));
    svg.setAttribute('height', String(box.height));
    const badges = [...grid.querySelectorAll('.timeline-card-new .timeline-badge-new')];
    let d = '';
    for (let i = 0; i < badges.length - 1; i++) {
      const a = badges[i].getBoundingClientRect();
      const b = badges[i + 1].getBoundingClientRect();
      const x1 = a.left - box.left + a.width / 2;
      const y1 = a.top - box.top + a.height / 2;
      const x2 = b.left - box.left + b.width / 2;
      const y2 = b.top - box.top + b.height / 2;
      const gap = y2 - y1;
      const r = gap < 40 ? gap / 2 : 20;
      const mid = y1 + gap / 2;
      const dir = x2 > x1 ? 1 : -1;
      d += `${i === 0 ? ' M' : ' L'} ${x1} ${y1} L ${x1} ${mid - r} Q ${x1} ${mid} ${x1 + dir * r} ${mid} L ${x2 - dir * r} ${mid} Q ${x2} ${mid} ${x2} ${mid + r} L ${x2} ${y2}`;
    }
    svg.querySelectorAll('path').forEach((line) => line.setAttribute('d', d));
  };
  window.addEventListener('resize', () => requestAnimationFrame(draw));
  // Measuring this grid forces layout, so it waits until the page has settled.
  window.addEventListener('load', () => {
    if ('requestIdleCallback' in window) requestIdleCallback(draw, { timeout: 1500 });
    else setTimeout(draw, 300);
  });
}

function initOrgChart() {
  const outer = document.querySelector<HTMLElement>('.oc-wrapper-outer');
  const stage = document.querySelector<HTMLElement>('.oc-stage-scaler');
  if (!outer || !stage) return;
  const w = parseFloat(stage.style.width);
  const h = parseFloat(stage.style.height);
  const [zoomOut, fit, zoomIn] = document.querySelectorAll<HTMLButtonElement>('.oc-zoom-btn');
  let scale = 1;
  let manual = false;
  const apply = () => {
    stage.style.transform = `scale(${scale})`;
    outer.style.height = `${Math.ceil(h * scale) + 15}px`;
    fit.textContent = 'Fit';
  };
  const fitToWidth = () => {
    scale = Math.min(Math.max((outer.clientWidth - 32) / w, 0.28), 1);
    apply();
  };
  zoomOut.addEventListener('click', () => { manual = true; scale = Math.max(scale - 0.15, 0.25); apply(); });
  zoomIn.addEventListener('click', () => { manual = true; scale = Math.min(scale + 0.15, 1.4); apply(); });
  fit.addEventListener('click', () => { manual = false; fitToWidth(); });
  window.addEventListener('resize', () => { if (!manual) fitToWidth(); });
  requestAnimationFrame(fitToWidth);
}

/** Below-the-fold sections render lazily (content-visibility), so a #hash jump can land short or long. Re-align until the layout settles or the visitor scrolls. */
function initHashAlign() {
  if (!location.hash) return;
  let done = false;
  const stop = () => { done = true; };
  for (const ev of ['wheel', 'touchstart', 'keydown', 'mousedown']) addEventListener(ev, stop, { once: true, passive: true });
  const align = () => {
    if (done) return;
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  };
  const run = () => [0, 250, 700, 1500].forEach((t) => setTimeout(align, t));
  if (document.readyState === 'complete') run(); else addEventListener('load', run, { once: true });
}

/** On phones the three contact buttons sit behind one toggle so they stop covering page text. */
function initFloating() {
  const box = document.querySelector<HTMLElement>('.floating-actions');
  const toggle = box?.querySelector<HTMLButtonElement>('.float-toggle');
  if (!box || !toggle) return;
  const set = (open: boolean) => { box.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); };
  toggle.addEventListener('click', () => set(!box.classList.contains('open')));
  box.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
  document.addEventListener('click', (e) => { if (!box.contains(e.target as Node)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}

initHeader();
initFloating();
initHashAlign();
initReveal();
initCounters();
initFaqs();
initAccordions();
initIconToggle();
initTimeline();
initOrgChart();
if (document.getElementById('contactForm')) import('./form');
