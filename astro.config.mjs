import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://axisiconstructure.com',
  output: 'static',
  adapter: node({ mode: 'middleware' }),
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
  server: { port: 4321 },
});
