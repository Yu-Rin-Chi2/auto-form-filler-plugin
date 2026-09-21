// package.json の version を単一の情報源として public/manifest.json に同期する。
// ビルド前に実行する（npm run build から呼ばれる）。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgPath = join(root, 'package.json');
const manifestPath = join(root, 'public', 'manifest.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`[sync-version] manifest.json version -> ${pkg.version}`);
} else {
  console.log(`[sync-version] manifest.json version already ${pkg.version}`);
}
