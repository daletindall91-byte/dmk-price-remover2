import { PDFDocument, rgb } from 'pdf-lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DMK_ORIGIN = 'https://www.dmkeith.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function cleanInputUrl(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('Paste a DM Keith vehicle link first.');

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error('That does not look like a valid link.');
  }

  const hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  if (hostname !== 'dmkeith.com') {
    throw new Error('Please use a dmkeith.com vehicle link.');
  }

  return parsed;
}

function buildPrintPdfUrlFromStockId(stockId) {
  const page = `/used-car-details_print.aspx?Stock_ID=${stockId}`;
  return `${DMK_ORIGIN}/COG/COGPDF/COGCreatePDF.aspx?PAGE=${encodeURIComponent(page)}`;
}

function extractStockIdFromUrl(url) {
  const full = url.href;
  const fromPath = full.match(/\/id-(\d+)\/?/i);
  if (fromPath) return fromPath[1];

  const fromQuery = url.searchParams.get('Stock_ID') || url.searchParams.get('stock_id');
  if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;

  const pageParam = url.searchParams.get('PAGE') || url.searchParams.get('page');
  if (pageParam) {
    const decodedPage = decodeHtml(pageParam);
    const fromPageParam = decodedPage.match(/Stock_ID=(\d+)/i);
    if (fromPageParam) return fromPageParam[1];
  }

  return null;
}

function decodeHtml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&#38;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function addCandidate(candidates, value) {
  if (!value) return;
  const cleaned = decodeHtml(value).trim();
  if (!cleaned) return;

  let url;
  try {
    url = new URL(cleaned, DMK_ORIGIN).href;
  } catch {
    return;
  }

  if (!candidates.includes(url)) candidates.push(url);
}

function collectPrintCandidatesFromHtml(html, originalUrl) {
  const candidates = [];
  const decodedHtml = decodeHtml(html);

  const hrefRegex = /href=["']([^"']*(?:COGCreatePDF|COGPDF|used-car-details_print\.aspx)[^"']*)["']/gi;
  let hrefMatch;
  while ((hrefMatch = hrefRegex.exec(decodedHtml))) {
    const href = hrefMatch[1];
    if (/COGCreatePDF|COGPDF/i.test(href)) {
      addCandidate(candidates, href);
    } else if (/used-car-details_print\.aspx/i.test(href)) {
      const pagePath = href.startsWith('/') ? href : `/${href}`;
      addCandidate(candidates, `/COG/COGPDF/COGCreatePDF.aspx?PAGE=${encodeURIComponent(pagePath)}`);
    }
  }

  const cogRegex = /(?:https?:\/\/www\.dmkeith\.com)?\/COG\/COGPDF\/COGCreatePDF\.aspx\?PAGE=[^"'\s<>]+/gi;
  let cogMatch;
  while ((cogMatch = cogRegex.exec(decodedHtml))) {
    addCandidate(candidates, cogMatch[0]);
  }

  const stockRegex = /Stock_ID(?:=|%3D)(\d+)/gi;
  let stockMatch;
  while ((stockMatch = stockRegex.exec(decodedHtml))) {
    addCandidate(candidates, buildPrintPdfUrlFromStockId(stockMatch[1]));
  }

  const urlStockId = extractStockIdFromUrl(originalUrl);
  if (urlStockId) addCandidate(candidates, buildPrintPdfUrlFromStockId(urlStockId));

  return candidates;
}

async function findPrintPdfCandidates(originalUrl) {
  const candidates = [];

  if (/cogcreatepdf|cogpdf/i.test(originalUrl.href)) {
    addCandidate(candidates, originalUrl.href);
    return candidates;
  }

  // Important: some DM Keith advert URLs have an ID that is not the same as the print Stock_ID.
  // So we now read the advert page first and prefer the real Print button link where available.
  const pageResponse = await fetch(originalUrl.href, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
      referer: DMK_ORIGIN
    },
    cache: 'no-store'
  });

  if (pageResponse.ok) {
    const html = await pageResponse.text();
    for (const candidate of collectPrintCandidatesFromHtml(html, originalUrl)) {
      addCandidate(candidates, candidate);
    }
  }

  const urlStockId = extractStockIdFromUrl(originalUrl);
  if (urlStockId) addCandidate(candidates, buildPrintPdfUrlFromStockId(urlStockId));

  if (!candidates.length) {
    throw new Error('I could not find the print PDF link on that page.');
  }

  return candidates;
}

function bytesLookLikePdf(bytes) {
  return bytes?.[0] === 0x25 && bytes?.[1] === 0x50 && bytes?.[2] === 0x44 && bytes?.[3] === 0x46;
}

async function fetchPdfFromCandidates(candidates) {
  const tried = [];

  for (const candidate of candidates) {
    tried.push(candidate);
    const pdfResponse = await fetch(candidate, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/pdf,*/*',
        referer: DMK_ORIGIN
      },
      cache: 'no-store'
    }).catch(() => null);

    if (!pdfResponse || !pdfResponse.ok) continue;

    const inputBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    if (bytesLookLikePdf(inputBytes)) {
      return { inputBytes, printPdfUrl: candidate };
    }
  }

  throw new Error('I found the print option, but DM Keith did not return a valid PDF for this advert. Try opening the advert in your browser and pressing its Print button once, then paste the direct print PDF link into this tool.');
}

function coverPriceOnPage(page) {
  const width = page.getWidth();
  const height = page.getHeight();

  const x = width * 0.13;
  const y = height * 0.435;
  const maskWidth = width * 0.25;
  const maskHeight = height * 0.045;

  page.drawRectangle({
    x,
    y,
    width: maskWidth,
    height: maskHeight,
    color: rgb(246 / 255, 243 / 255, 242 / 255),
    borderColor: rgb(246 / 255, 243 / 255, 242 / 255),
    borderWidth: 0
  });
}

async function makePriceRemovedPdf(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const firstPage = pdfDoc.getPages()[0];
  if (!firstPage) throw new Error('The PDF appears to be empty.');

  coverPriceOnPage(firstPage);
  return pdfDoc.save();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const originalUrl = cleanInputUrl(body.url);
    const candidates = await findPrintPdfCandidates(originalUrl);
    const { inputBytes, printPdfUrl } = await fetchPdfFromCandidates(candidates);

    const outputBytes = await makePriceRemovedPdf(inputBytes);
    const stockId = extractStockIdFromUrl(new URL(printPdfUrl)) || 'vehicle';
    const fileName = `dmk-${stockId}-price-removed.pdf`;

    return new Response(outputBytes, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${fileName}"`,
        'x-file-name': fileName,
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Something went wrong.' }, { status: 400 });
  }
}
