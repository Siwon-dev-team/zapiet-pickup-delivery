import * as esbuild from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function build() {
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'widget.ts')],
      bundle: true,
      minify: true,
      minifyWhitespace: true,
      minifyIdentifiers: true,
      minifySyntax: true,
      target: 'es2015',
      outfile: path.join(__dirname, '../extensions/zapiet-widget/assets/widget.js'),
      format: 'iife',
      sourcemap: false,
      treeShaking: true,
      legalComments: 'none',
    });
    console.log('Widget compiled');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();

