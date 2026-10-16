import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// The public URL: link previews (og:image) need absolute URLs. Swap for the custom domain when there is one.
export default defineConfig({
  site: 'https://pokegear-lime.vercel.app',
  integrations: [react()],
});
