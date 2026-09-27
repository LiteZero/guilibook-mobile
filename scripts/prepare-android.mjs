import { access, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const propertiesPath = join(process.cwd(), 'android', 'gradle.properties');
try {
  await access(propertiesPath);
} catch {
  console.log('Android project is not present; skip gradle.properties patch.');
  process.exit(0);
}

const current = await readFile(propertiesPath, 'utf8');
if (!current.split(/\r?\n/).some((line) => line.trim() === 'android.overridePathCheck=true')) {
  await appendFile(propertiesPath, `${current.endsWith('\n') ? '' : '\n'}android.overridePathCheck=true\n`);
}
console.log('Android path compatibility configured.');
