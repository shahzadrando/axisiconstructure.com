import data from '../generated/cards.json';

type Img = { src: string; srcset?: string; sizes?: string; width?: string; height?: string };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const delay = (i: number) => (i % 3 ? ` delay-${i % 3}` : '');
const img = (i: Img, alt: string, eager: boolean, style = '') =>
  `<img src="${i.src}" alt="${esc(alt)}"${eager ? '' : ' loading="lazy"'} decoding="async"${i.srcset ? ` srcset="${i.srcset}" sizes="${i.sizes ?? ''}"` : ''}` +
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

const blocks: Record<string, () => string> = {
  'home-services': homeServices,
  services: servicesGrid,
  'home-sectors': () => sectorCards(data.sectors, false),
  sectors: () => sectorCards(data.sectors, true),
};

/** Fills the <!--cards:name--> placeholders in a generated page from cards.json. */
export const fillCards = (html: string) => html.replace(/<!--cards:([\w-]+)-->/g, (_, name) => blocks[name]?.() ?? '');
