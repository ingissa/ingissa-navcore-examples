import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  server: {
    open: true,
    port: 3000,
  },
  resolve: {
    alias: {
      // Allow examples to import from '@ingissa/navcore-*' and have it resolve to node_modules
      // This is usually handled by Vite automatically but we'll be explicit if needed.
    }
  }
});
