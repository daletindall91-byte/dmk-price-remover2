export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DMK_ORIGIN = 'https://www.dmkeith.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function decodeHtml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&#38;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function contextSnips(html, term) {
  const out = [];
  const lower = html.toLowerCase();
  const needle = term.toLowerCase();
  let index = 0;
  while ((index = lower.indexOf(needle, index)) !== -1 && out.length < 12) {
    out.push(html.slice(Math.max(0, index - 260), Math.min(html.length, index + 520)));
    index += needle.length;
  }
  return out;
}

function firstBytesText(bytes) {
  return Array.from(bytes.slice(0, 80)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

async function testUrl(candidate) {
  try {
    const response = await fetch(candidate, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/pdf,text/html,*/*',
        referer: DMK_ORIGIN
      },
      cache: 'no-store'
    });
    const contentType = response.headers.get('content-type') || '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder().decode(bytes.slice(0, 500));
    return {
      candidate,
      status: response.status,
      contentType,
      firstBytes: firstBytesText(bytes),
      firstText: text
    };
  } catch (error) {
    return { candidate, error: error.message };
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');
  if (!target) return Response.json({ error: 'Missing url' }, { status: 400 });

  const pageResponse = await fetch(target, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
      referer: DMK_ORIGIN
    },
    cache: 'no-store'
  });

  const html = await pageResponse.text();
  const decoded = decodeHtml(html);
  const links = [];
  for (const match of decoded.matchAll(/(?:href|onclick|data-[a-z0-9_-]+)=["']([^"']+)["']/gi)) {
    const val = match[1];
    if (/print|pdf|COG|Stock|vehicle/i.test(val)) links.push(val);
  }

  const obvious = [];
  for (const match of decoded.matchAll(/(?:https?:\/\/www\.dmkeith\.com)?\/[A-Za-z0-9_\-/\.]+\.aspx\?[^"'\s<>]+/gi)) {
    if (/print|pdf|Stock|vehicle|used-car/i.test(match[0])) obvious.push(match[0]);
  }

  const idMatch = target.match(/id-(\d+)/i);
  const id = idMatch?.[1];
  const tests = [];
  if (id) {
    const page1 = `/used-car-details_print.aspx?Stock_ID=${id}`;
    const page2 = `/used-car-details_print.aspx?StockID=${id}`;
    const page3 = `/used-car-details.aspx?Stock_ID=${id}`;
    const page4 = `/used-car-details/used-nissan-micra-12-acenta-5dr-brilliant-silver-manual-petrol/id-${id}/`;
    for (const page of [page1, page2, page3, page4]) {
      tests.push(await testUrl(`${DMK_ORIGIN}/COG/COGPDF/COGCreatePDF.aspx?PAGE=${encodeURIComponent(page)}`));
    }
  }

  return Response.json({
    pageStatus: pageResponse.status,
    contentType: pageResponse.headers.get('content-type'),
    length: html.length,
    title: decoded.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
    printContexts: contextSnips(decoded, 'print'),
    pdfContexts: contextSnips(decoded, 'pdf'),
    stockContexts: contextSnips(decoded, 'Stock'),
    links: [...new Set(links)].slice(0, 80),
    obvious: [...new Set(obvious)].slice(0, 80),
    tests
  });
}
