import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { db } from '../../config/db.js';

const URL_RE = /(https?:\/\/[^\s<>"'{}|\\^`[\]]{4,})/i;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 5_000;
const MAX_SIZE = 256 * 1024;

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export function extractFirstUrl(plaintext: string): string | null {
  const m = URL_RE.exec(plaintext);
  return m ? m[1] : null;
}

function doFetch(url: string, redirectsLeft = MAX_REDIRECTS): Promise<string> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new Error('Invalid URL'));
    }

    if (isPrivateHost(parsed.hostname)) {
      return reject(new Error('Private host blocked (SSRF guard)'));
    }

    const getter = parsed.protocol === 'https:' ? httpsGet : httpGet;
    const req = getter(
      url,
      { headers: { 'User-Agent': 'MessengerLinkBot/1.0', Accept: 'text/html' } },
      (res: IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
          const next = new URL(res.headers.location, url).toString();
          doFetch(next, redirectsLeft - 1).then(resolve).catch(reject);
          return;
        }

        const ct = res.headers['content-type'] ?? '';
        if (!ct.includes('text/html')) {
          res.resume();
          return resolve('');
        }

        res.setEncoding('utf8');
        let html = '';
        let settled = false;

        const finish = () => {
          if (!settled) {
            settled = true;
            resolve(html);
          }
        };

        res.on('data', (chunk: string) => {
          html += chunk;
          if (html.length > MAX_SIZE || html.includes('</head>')) {
            res.destroy();
            finish();
          }
        });
        res.on('end', finish);
        res.on('error', (err) => { if (!settled) { settled = true; reject(err); } });
      },
    );

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

function parseMeta(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"'<>]+)["']` +
    `|<meta[^>]+content=["']([^"'<>]+)["'][^>]+(?:property|name)=["']${property}["']`,
    'i',
  );
  const m = re.exec(html);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function parseTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html);
  return m ? m[1].trim() : null;
}

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreviewData | null> {
  try {
    const html = await doFetch(rawUrl);
    if (!html) return null;

    const title =
      parseMeta(html, 'og:title') ??
      parseMeta(html, 'twitter:title') ??
      parseTitle(html);

    const description =
      parseMeta(html, 'og:description') ??
      parseMeta(html, 'description') ??
      parseMeta(html, 'twitter:description');

    const imageUrl =
      parseMeta(html, 'og:image') ??
      parseMeta(html, 'twitter:image');

    const siteName = parseMeta(html, 'og:site_name');

    if (!title && !description) return null;

    return { url: rawUrl, title, description, imageUrl, siteName };
  } catch {
    return null;
  }
}

export async function saveLinkPreview(messageId: string, preview: LinkPreviewData): Promise<void> {
  await db.query(
    `INSERT INTO link_previews (message_id, url, title, description, image_url, site_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (message_id) DO UPDATE SET
       url = $2, title = $3, description = $4, image_url = $5, site_name = $6, fetched_at = now()`,
    [messageId, preview.url, preview.title, preview.description, preview.imageUrl, preview.siteName],
  );
}
