import data from '../generated/cards.json';

type Img = { src: string; srcset?: string; sizes?: string; width?: string; height?: string };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const delay = (i: number) => (i % 3 ? ` delay-${i % 3}` : '');
const img = (i: Img, alt: string, eager: boolean, style = '') =>
  `<img src="${i.src}" alt="${esc(alt)}"${eager ? '' : ' loading="lazy"'} decoding="async"${i.srcset ? ` srcset="${i.srcset}" sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 400px"` : ''}` +
  `${i.width ? ` width="${i.width}" height="${i.height}"` : ''}${style}>`;

type Service = (typeof data.services)[number] & { homeOrder?: number | null; homeIcon?: string; homeImg?: Img; homeAlt?: string; homeTitle?: string; bullets?: string[]; cta?: string };
const services = data.services as Service[];

const homeServices = () =>
  services
    .filter((s) => s.homeOrder != null)
    .sort((a, b) => a.homeOrder! - b.homeOrder!)
    .map(
      (s, i) =>
        `<div class="service-card-new fade-in-up${delay(i)}"><div class="service-card-img">${img(s.homeImg!, s.homeAlt!, false)}<div class="service-card-icon-badge"><i class="ph ph-${s.homeIcon}"></i></div></div>` +
        `<div class="service-card-body-new"><h3>${esc(s.homeTitle ?? s.title)}</h3><ul class="service-bullets-new">${(s.bullets ?? [])
          .map((b) => `<li><span class="anim-bullet dots"><span></span><span></span><span></span></span>${esc(b)}</li>`)
          .join('')}</ul><a href="${s.href}" class="service-card-cta">${esc(s.cta ?? 'Learn more')} <i class="ph ph-arrow-right"></i></a></div></div>`,
    )
    .join('');

const servicesGrid = () =>
  services
    .map(
      (s, i) =>
        `<div class="service-card fade-in-up${delay(i)}" style="padding: 0px; overflow: hidden; display: flex; flex-direction: column; background-color: rgb(248, 249, 250);">` +
        img(s.img, s.alt, i === 0, ' style="width: 100%; height: 220px; object-fit: cover;"') +
        `<div style="padding: 30px; flex: 1 1 0%; display: flex; flex-direction: column;"><div class="card-icon mb-3"><i class="ph ph-${s.icon}"></i></div><h3>${esc(s.title)}</h3>` +
        `<p class="mb-3" style="flex: 1 1 0%;">${esc(s.desc)}</p><a href="${s.href}" class="btn btn-outline-blue w-100 text-center" style="display: block;">Explore Details <i class="ph ph-arrow-right"></i><span class="sr-only"> about ${esc(s.title)}</span></a></div></div>`,
    )
    .join('');

type Sector = { href: string; title: string; icon: string; alt: string; img: Img; text: string };
const sectorCards = (list: Sector[], page: boolean) =>
  list
    .map(
      (s, i) =>
        `<div class="sector-card-premium fade-in-up${page ? ' scale-in' : ''}${delay(i)}"><div class="sector-card-img-wrapper">${img(s.img, s.alt, page && i === 0)}<div class="sector-card-badge"><i class="ph ph-${s.icon}"></i></div></div>` +
        `<div class="sector-card-content"><h3 class="sector-card-title">${esc(s.title)}</h3><p class="sector-card-text">${esc(s.text)}</p><a href="${s.href}" class="sector-card-link">Learn more <i class="ph ph-arrow-right"></i><span class="sr-only"> about ${esc(s.title)}</span></a></div></div>`,
    )
    .join('');

const stripLabel: Record<string, string> = { '/transport-rental': 'Transport & Equipment', '/plant-shutdowns': 'Shutdown & Commissioning', '/cctv-systems': 'CCTV & Security' };
const strip = () =>
  services
    .map((s) => `<a class="capabilities-strip-item" href="${s.href}"><i class="ph ph-${s.icon}"></i><span>${esc(stripLabel[s.href] ?? s.title)}</span></a>`)
    .join('');

const blocks: Record<string, () => string> = {
  strip,
  'service-options': () => (data.inquiry as string[][]).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join(''),
  'home-services': homeServices,
  services: servicesGrid,
  'home-sectors': () => sectorCards(data.sectors, false),
  sectors: () => sectorCards(data.sectors, true),
};

const related: Record<string, string[]> = {
  '/civil-engineering': ['/mechanical-works', '/hvac-maintenance', '/transport-rental', '/manpower-supply'],
  '/mechanical-works': ['/plant-shutdowns', '/electrical-instrumentation', '/civil-engineering', '/manpower-supply'],
  '/electrical-instrumentation': ['/cctv-systems', '/plant-shutdowns', '/solar-installation', '/mechanical-works'],
  '/hvac-maintenance': ['/electrical-instrumentation', '/civil-engineering', '/solar-installation', '/manpower-supply'],
  '/solar-installation': ['/electrical-instrumentation', '/hvac-maintenance', '/civil-engineering'],
  '/cctv-systems': ['/electrical-instrumentation', '/manpower-supply', '/hvac-maintenance'],
  '/transport-rental': ['/manpower-supply', '/civil-engineering', '/mechanical-works'],
  '/manpower-supply': ['/transport-rental', '/civil-engineering', '/mechanical-works', '/electrical-instrumentation'],
  '/plant-shutdowns': ['/mechanical-works', '/electrical-instrumentation', '/manpower-supply', '/transport-rental'],
  '/marine-offshore': ['/mechanical-works', '/plant-shutdowns', '/manpower-supply', '/transport-rental'],
  '/oil-gas-petrochemical': ['/mechanical-works', '/plant-shutdowns', '/electrical-instrumentation', '/manpower-supply'],
  '/fertilizer-industrial': ['/mechanical-works', '/plant-shutdowns', '/transport-rental', '/manpower-supply'],
  '/energy-power-utilities': ['/electrical-instrumentation', '/solar-installation', '/mechanical-works', '/plant-shutdowns'],
  '/infrastructure-contracting': ['/civil-engineering', '/transport-rental', '/manpower-supply'],
  '/commercial-residential': ['/civil-engineering', '/hvac-maintenance', '/electrical-instrumentation', '/cctv-systems'],
  '/healthcare-education': ['/hvac-maintenance', '/electrical-instrumentation', '/cctv-systems', '/civil-engineering'],
};

const relatedBlock = (route: string) => {
  const links = (related[route] ?? []).map((href) => services.find((s) => s.href === href)).filter((s): s is Service => !!s);
  if (!links.length) return '';
  return (
    '<section class="section-padding bg-white rel-section"><div class="container"><div class="section-header text-center mb-4"><span class="section-label">Explore More</span><h2 class="hl3">Related Services</h2></div>' +
    `<div class="rel-links">${links.map((s) => `<a href="${s.href}"><i class="ph ph-${s.icon}"></i>${esc(s.title)}<i class="ph ph-arrow-right"></i></a>`).join('')}</div></div></section>`
  );
};

/** Fills the <!--cards:name--> placeholders in a generated page from cards.json and adds the related-services strip. */
export const fillCards = (html: string, route = '') => {
  const out = html.replace(/<!--cards:([\w-]+)-->/g, (_, name) => blocks[name]?.() ?? '');
  const rel = relatedBlock(route);
  if (!rel) return out;
  const i = out.indexOf('<section class="cta-banner');
  return i < 0 ? out.replace('</main>', rel + '</main>') : out.slice(0, i) + rel + out.slice(i);
};
