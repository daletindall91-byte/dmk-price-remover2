'use client';

import { useState } from 'react';

const bookmarklet = `javascript:(()=>{const rx=/£\s?\d[\d,]*(?:\.\d{2})?/;const words=['price','monthly','finance','payment','cost'];const seen=new Set();function txt(e){return((e.innerText||e.textContent||'')+'').trim()}function ids(e){return((e.id||'')+' '+(e.className||'')).toLowerCase()}function hide(e){if(!e||seen.has(e))return;seen.add(e);e.setAttribute('data-dmk-price-hidden','yes');e.style.setProperty('color','transparent','important');e.style.setProperty('text-shadow','none','important');e.style.setProperty('background','#fff','important');e.style.setProperty('border-color','transparent','important')}document.querySelectorAll('body *').forEach(e=>{const t=txt(e);const id=ids(e);const leaf=e.children.length===0;if((leaf&&rx.test(t)&&t.length<120)||(rx.test(t)&&words.some(w=>id.includes(w))))hide(e)});setTimeout(()=>window.print(),250)})();`;

export default function Home() {
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [fileName, setFileName] = useState('dmk-price-removed.pdf');

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl('');
    }

    try {
      const response = await fetch('/api/remove-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'The PDF could not be created.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const suggestedName = response.headers.get('x-file-name') || 'dmk-price-removed.pdf';
      setDownloadUrl(objectUrl);
      setFileName(suggestedName);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function printPdf() {
    if (!downloadUrl) return;
    const win = window.open(downloadUrl, '_blank');
    if (win) win.focus();
  }

  function openVehiclePage() {
    if (!link.trim()) {
      setError('Paste the DM Keith advert link first.');
      return;
    }
    window.open(link.trim(), '_blank', 'noopener,noreferrer');
  }

  return (
    <main className="page">
      <section className="card hero">
        <p className="eyebrow">DM Keith print helper</p>
        <h1>Remove the visible price from a vehicle printout</h1>
        <p className="intro">
          DM Keith blocks Vercel from downloading some print PDFs, so the best method is now the browser helper below.
          It runs on the DM Keith page you already have open, hides the price, then opens your print window.
        </p>

        <div className="helper-box">
          <h2>Best method: one-click browser helper</h2>
          <ol>
            <li>Drag the green button below to your bookmarks bar once.</li>
            <li>Open any DM Keith vehicle advert.</li>
            <li>Click the bookmark. It hides the price and opens the print screen.</li>
          </ol>
          <a className="bookmarklet" href={bookmarklet}>DMK Hide Price + Print</a>
          <p className="small-help">
            On the print screen, choose your printer or choose Save as PDF.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <label htmlFor="vehicle-link">Vehicle advert link</label>
          <textarea
            id="vehicle-link"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://www.dmkeith.com/used-car-details/.../id-3700060248465819202/"
            rows={4}
            required
          />
          <div className="button-row">
            <button type="button" onClick={openVehiclePage}>Open vehicle page</button>
            <button type="submit" disabled={busy}>
              {busy ? 'Trying PDF...' : 'Try direct PDF method'}
            </button>
          </div>
        </form>

        {error ? <div className="error">{error}</div> : null}

        {downloadUrl ? (
          <div className="result">
            <h2>PDF ready</h2>
            <p>The price area has been covered. Open it below to check, download or print it.</p>
            <div className="actions">
              <a href={downloadUrl} download={fileName}>Download PDF</a>
              <button type="button" onClick={printPdf}>Open / Print PDF</button>
            </div>
            <iframe src={downloadUrl} title="Price removed PDF preview" />
          </div>
        ) : null}
      </section>

      <section className="note">
        <strong>Important:</strong> the browser helper visually hides visible prices for printing. It does not alter the
        vehicle advert or remove data from DM Keith.
      </section>
    </main>
  );
}
