// dist/ を Chrome Web Store / GitHub Release 提出用の zip にまとめる。
// 実行: npm run package（内部で npm run build を先に実行する）
// 出力: release/auto-form-filler-v<version>.zip
//
// - zip の中身は dist/ 直下（manifest.json がルート）
// - dist-e2e/（E2E 専用の host_permissions 付きビルド）は対象にしない
// - 外部ライブラリ・OS の zip コマンドに依存せず、Node の zlib で zip を書き出す
//   （PowerShell の Compress-Archive はエントリ名の区切りが `\` になり、Web Store 側で
//   manifest.json を見つけられないことがあるため使わない）
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const releaseDir = join(root, 'release');

if (!existsSync(join(distDir, 'manifest.json'))) {
  throw new Error(`[package] dist/manifest.json が見つかりません。先に npm run build を実行してください: ${distDir}`);
}

const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  throw new Error(`[package] version が一致しません: manifest=${manifest.version} package.json=${pkg.version}`);
}

// E2E 用の host_permissions が混入していないことを確認する（提出物の権限モデルを守る）
// 既定の中継サーバー（src/shared/config.ts の DEFAULT_WORKER_ORIGIN）のみ
const ALLOWED_HOSTS = /^https:\/\/formfill\.yrctool\.stream\/\*$/;
const badHost = (manifest.host_permissions ?? []).find((h) => !ALLOWED_HOSTS.test(h));
if (badHost) {
  throw new Error(`[package] 想定外の host_permissions が含まれています: ${badHost}`);
}

/** dist/ 配下のファイルを相対パス（`/` 区切り）で列挙する */
function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full));
    } else {
      out.push(relative(distDir, full).split(sep).join('/'));
    }
  }
  return out.sort();
}

// CRC-32（zip のローカルヘッダ・セントラルディレクトリで必要）
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 固定の DOS 日時（ビルドの再現性のため実時刻を埋め込まない）: 2020-01-01 00:00 */
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const name of files) {
    const data = readFileSync(join(distDir, name));
    const compressed = deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBuf, compressed);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDir, end]);
}

const files = listFiles(distDir);
mkdirSync(releaseDir, { recursive: true });
const zipPath = join(releaseDir, `auto-form-filler-v${manifest.version}.zip`);
writeFileSync(zipPath, buildZip(files));

console.log(`[package] ${files.length} files -> ${zipPath}`);
