const groups: Array<[string, RegExp]> = [
  ['about', /about|team|vision-2030/],
  ['blog', /^\/blog/],
  ['services', /service|civil|mechanical|electrical|hvac|solar|cctv|transport|manpower|plant|marine/],
  ['sectors', /sector/],
  ['projects', /project/],
  ['safety', /safety/],
  ['careers', /career/],
  ['contact', /contact/],
];

/** Same active-menu rules as the old header, plus the new blog section. */
export function groupFor(path: string): string {
  if (path === '/') return 'home';
  return groups.find(([, re]) => re.test(path))?.[0] ?? '';
}
