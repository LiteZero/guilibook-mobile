import { mkdir, copyFile, readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const webDir = join(root, 'www');

// 清理旧的 www/，避免 stale 资源（特别是 SVG 改名/删除后不会残留）
await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

// 1) 顶层文件直接拷贝
for (const file of ['index.html', 'styles.css', 'app.js', 'data.json']) {
  await copyFile(join(root, file), join(webDir, file));
}

// 2) 递归拷贝目录（目前就 img/，未来扩展容易）
async function copyDir(srcDir, destDir) {
  await mkdir(destDir, { recursive: true });
  for (const entry of await readdir(srcDir)) {
    const src = join(srcDir, entry);
    const dest = join(destDir, entry);
    const info = await stat(src);
    if (info.isDirectory()) {
      await copyDir(src, dest);
    } else {
      await copyFile(src, dest);
    }
  }
}

const assetDirs = ['img'];
for (const dir of assetDirs) {
  const src = join(root, dir);
  try {
    const info = await stat(src);
    if (info.isDirectory()) await copyDir(src, join(webDir, dir));
  } catch {
    // 目录不存在时跳过——避免你还没建 img/ 时构建报错
  }
}

console.log(`Prepared ${webDir}`);
