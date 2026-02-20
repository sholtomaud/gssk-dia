import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/gssk-editor.js',
      name: 'GsskEditor',
      fileName: (format) => `gssk-editor.${format}.js`
    },
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
});
