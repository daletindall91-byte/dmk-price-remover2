import { PDFDocument, rgb } from 'pdf-lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DMK_ORIGIN = 'https://www.dmkeith.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

// Adjust these values if DM Keith changes the A4 layout.
// Coordinates are ratios of the first PDF page size, so they still work if the PDF is scaled.
const PRICE_MASK = {
  xRatio: 0.12,
  yRatio: 0.425,
  widthRatio: 0.31,
  heightRatio: 0.075,
  background: rgb(246 / 255, 243 / 255, 242 / 255)
};

function logDebug(label, value) {
  console.log(`[dmk-price-remover] ${label}:`, value);
}

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
  if (hostname !== 'dmkeith.com') throw new Error('Please use a dmkeith.com vehicle link.');

  return parsed;
}

function extractVehicleId(url) {
  const match = url.href.match(/\/id-(\d+)\/?/i);
  if (!match) throw new Error('Could not find the vehicle ID in that link.');
  return match[1];
}

function buildPrintUrls(vehicleId) {
  const printPage = `/used-car-details_print.aspx?Stock_ID=${vehicleId}`;

  return [
    `${DMK_ORIGIN}/cog/cogpdf/cogcreatepdf.aspx?PAGE=${printPage}`,
    `${DMK_ORIGIN}/COG/COGPDF/COGCreatePDF.aspx?PAGE=${encodeURIComponent(printPage)}`
  ];
}

function bytesLookLikePdf(bytes) {
  return bytes?.[0] === 0x25 && bytes?.[1] === 0x50 && bytes?.[2] === 0x44 && bytes?.[3] === 0x46;
}

function responsePreview(bytes) {
  try {
    return new TextDecoder().decode(bytes.slice(0, 300)).replace(/\s+/g, ' ').slice(0, 300);
  } catch {
    return '';
  }
}

function extractCookies(response) {
  const rawCookies = [];

  if (typeof response.headers.getSetCookie === 'function') {
    rawCookies.push(...response.headers.getSetCookie());
  }

  const combined = response.headers.get('set-cookie');
  if (combined) rawCookies.push(combined);

  return rawCookies
    .flatMap((cookie) => String(cookie).split(/,(?=\s*[^;,=]+=[^;,]+)/g))
    .map((cookie) => cookie.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function visitAdvertPage(originalUrl) {
  const response = await fetch(originalUrl.href, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      referer: DMK_ORIGIN
    },
    cache: 'no-store',
    redirect: 'follow'
  });

  const cookies = extractCookies(response);
  logDebug('advert status', response.status);
  logDebug('advert content-type', response.headers.get('content-type') || '');
  logDebug('advert cookies found', cookies ? 'yes' : 'no');

  return { response, cookies };
}

async function fetchPrintPdf(printUrl, referer, cookies) {
  const headers = {
    'user-agent': USER_AGENT,
    accept: 'application/pdf,*/*',
    referer
  };

  if (cookies) headers.cookie = cookies;

  const response = await fetch(printUrl, {
    headers,
    cache: 'no-store',
    redirect: 'follow'
  });

  const contentType = response.headers.get('content-type') || '';
  const bytes = new Uint8Array(await response.arrayBuffer());

  logDebug('print url', printUrl);
  logDebug('print status', response.status);
  logDebug('print content-type', contentType);

  return { response, contentType, bytes };
}

function coverPriceOnPage(page) {
  const width = page.getWidth();
  const height = page.getHeight();

  page.drawRectangle({
    x: width * PRICE_MASK.xRatio,
    y: height * PRICE_MASK.yRatio,
    width: width * PRICE_MASK.widthRatio,
    height: height * PRICE_MASK.heightRatio,
    color: PRICE_MASK.background,
    borderColor: PRICE_MASK.background,
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
    const vehicleId = extractVehicleId(originalUrl);
    const printUrls = buildPrintUrls(vehicleId);

    logDebug('original url', originalUrl.href);
    logDebug('vehicle id', vehicleId);
    logDebug('generated print url', printUrls[0]);

    const { cookies } = await visitAdvertPage(originalUrl);

    let lastFailure = null;
    for (const printUrl of printUrls) {
      const result = await fetchPrintPdf(printUrl, originalUrl.href, cookies);

      if (result.response.ok && bytesLookLikePdf(result.bytes)) {
        const outputBytes = await makePriceRemovedPdf(result.bytes);
        const fileName = `dmk-${vehicleId}-price-free-printout.pdf`;

        return new Response(outputBytes, {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': `attachment; filename="${fileName}"`,
            'x-file-name': fileName,
            'cache-control': 'no-store'
          }
        });
      }

      lastFailure = {
        status: result.response.status,
        contentType: result.contentType,
        preview: responsePreview(result.bytes)
      };
      logDebug('non-pdf preview', lastFailure.preview);
    }

    throw new Error(
      `The DM Keith print PDF could not be downloaded. Last response: status ${lastFailure?.status || 'unknown'}, content-type ${lastFailure?.contentType || 'unknown'}. ${lastFailure?.preview ? `Preview: ${lastFailure.preview}` : ''}`
    );
  } catch (error) {
    return Response.json({ error: error.message || 'Something went wrong.' }, { status: 400 });
  }
}
