const site = 'https://axisiconstructure.com';

interface PageMeta {
  route: string;
  title: string;
  description: string;
  h1: string;
  kind: string;
  image: string | null;
  faq: object[];
}

export const organization = {
  '@context': 'https://schema.org',
  '@type': 'GeneralContractor',
  '@id': `${site}/#organization`,
  name: 'AXIS ICON STRUCTURE',
  url: `${site}/`,
  logo: `${site}/images/axis-logo.webp`,
  image: `${site}/images/hero-section-image.webp`,
  description: 'AXIS ICON STRUCTURE delivers civil engineering, mechanical, electrical and instrumentation, HVAC, CCTV, manpower supply and equipment rental services.',
  telephone: '+966507673009',
  email: 'info@axisiconstructure.com',
  address: [
    { '@type': 'PostalAddress', streetAddress: '7481 - Al Abrar Street, Al Aqrabiyah District', addressLocality: 'Al Khobar', addressCountry: 'SA' },
    { '@type': 'PostalAddress', streetAddress: 'Railway Road Jahanian Mandi', addressLocality: 'District Khanewal, Multan', addressCountry: 'PK' },
  ],
};

export function breadcrumbs(name: string, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${site}/` },
      { '@type': 'ListItem', position: 2, name, item: `${site}${path}` },
    ],
  };
}

export function schemaFor(page: PageMeta) {
  const out: object[] = [];
  if (page.kind === 'home') {
    out.push(organization, { '@context': 'https://schema.org', '@type': 'WebSite', url: `${site}/`, name: 'AXIS ICON STRUCTURE', publisher: { '@id': `${site}/#organization` } });
  } else {
    out.push(breadcrumbs(page.h1 || page.title, page.route));
  }
  if (page.kind === 'service' || page.kind === 'sector') {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: page.kind === 'sector' ? `${page.h1} Engineering & Construction Services` : page.h1,
      serviceType: page.h1,
      description: page.description,
      url: `${site}${page.route}`,
      areaServed: ['Saudi Arabia', 'Pakistan'],
      provider: { '@type': 'GeneralContractor', name: 'AXIS ICON STRUCTURE', url: `${site}/` },
    });
  }
  if (page.route === '/contact' || page.route === '/about') {
    out.push({ '@context': 'https://schema.org', '@type': page.route === '/contact' ? 'ContactPage' : 'AboutPage', url: `${site}${page.route}`, name: page.title, about: { '@id': `${site}/#organization` } });
  }
  if (page.route === '/team') {
    const people: [string, string][] = [['Mobeen Zia', 'CEO and Founder'], ['Mujeeb Ali', 'Co-Founder and MD'], ['Ch Kashif Naveed', 'Operations Manager'], ['Sohail Akhtar', 'Deputy Manager'], ['Ch Tallal Majeed', 'Finance & HR Manager'], ['Ch Moin Anwar', 'Project Manager'], ['Naeem', 'Construction Manager']];
    for (const [name, jobTitle] of people) out.push({ '@context': 'https://schema.org', '@type': 'Person', name, jobTitle, worksFor: { '@id': `${site}/#organization` } });
  }
  if (page.faq.length) out.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: page.faq });
  return out;
}
