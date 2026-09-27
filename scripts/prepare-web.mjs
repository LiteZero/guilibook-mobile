import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const webDir = join(root, 'www');
await mkdir(webDir, { recursive: true });

for (const file of ['index.html', 'styles.css', 'app.js', 'data.json']) {
  await copyFile(join(root, file), join(webDir, file));
}

console.log(`Prepared ${webDir}`);
