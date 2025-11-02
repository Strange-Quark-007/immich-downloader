import fs from 'fs';
import axios from 'axios';
import pLimit from 'p-limit';
import { mkdirSync, existsSync } from 'fs';
import 'dotenv/config';

const limit = pLimit(10);

const API_URL = process.env.IMMICH_URL;
const API_TOKEN = process.env.IMMICH_TOKEN;
const DEST = process.env.DOWNLOAD_DEST || './downloads';
const ALBUM_IDS = (process.env.IMMICH_ALBUMS || '')
  .split(',')
  .map((s) => s.trim());

if (!API_URL || !API_TOKEN || !ALBUM_IDS[0]) {
  console.error(
    'Missing IMMICH_URL, IMMICH_TOKEN, or IMMICH_ALBUMS environment variables.'
  );
  process.exit(1);
}

if (!existsSync(DEST)) mkdirSync(DEST);

const client = axios.create({
  baseURL: API_URL,
  headers: { Authorization: `Bearer ${API_TOKEN}` },
  responseType: 'arraybuffer',
  timeout: 60000,
});

async function fetchAlbum(albumId) {
  const res = await client.get(`/api/albums/${albumId}`, {
    responseType: 'json',
  });
  return res.data;
}

async function downloadAsset(asset, albumDir) {
  const name = asset.originalFileName || `${asset.id}.jpg`;
  const path = `${albumDir}/${name}`;
  const res = await client.get(`/api/assets/${asset.id}/original`);
  await fs.promises.writeFile(path, res.data);
  console.log('Saved', name);
}

async function main() {
  for (const albumId of ALBUM_IDS) {
    console.log(`Fetching album ${albumId}...`);
    const album = await fetchAlbum(albumId);
    const assets = album.assets || [];
    const albumDir = `${DEST}/${album.albumName || albumId}`;
    if (!existsSync(albumDir)) mkdirSync(albumDir);

    console.log(`Found ${assets.length} assets.`);

    const tasks = assets.map((asset) =>
      limit(() =>
        downloadAsset(asset, albumDir).catch((err) => {
          console.error('Failed:', asset.id, err.message);
        })
      )
    );

    await Promise.all(tasks);
  }

  console.log('All album downloads complete.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
