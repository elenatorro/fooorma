import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib/index.ts'),
      name: 'fooorma',
      fileName: 'fooorma',
      formats: ['es', 'umd'],
    },
    outDir: 'dist-lib',
    minify: 'terser',
    sourcemap: true,
    copyPublicDir: false,
  },
})
