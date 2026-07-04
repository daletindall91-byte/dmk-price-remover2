'use client';

import { useState } from 'react';

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
    if (win) {
      win.focus();
    }
  }

  return (
    <main className="page">
      <section className="card hero">
        <p className="eyebrow">DM Keith print helper</p>
        <h1>Remove the visible price from a vehicle printout</h1>
        <p className="intro">
          Paste the normal DM Keith vehicle advert link. The website will find the print PDF automatically,
          cover the price, then give you a new printable PDF.
        </p>

        <form onSubmit={handleSubmit} className="form">
          <label htmlFor="vehicle-link">Vehicle advert link or direct print PDF link</label>
          <textarea
            id="vehicle-link"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://www.dmkeith.com/used-car-details/.../id-3550620151311451727/"
            rows={4}
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Creating PDF...' : 'Remove price and create PDF'}
          </button>
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
        <strong>Important:</strong> this is for making a clean customer printout. It visually covers the price on
        the PDF; it is not a legal/security redaction tool for confidential documents.
      </section>
    </main>
  );
}
