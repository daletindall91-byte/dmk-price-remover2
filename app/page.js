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
    if (win) win.focus();
  }

  function resetForm() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl('');
    setFileName('dmk-price-removed.pdf');
    setError('');
    setLink('');
  }

  return (
    <main className="page">
      <section className="card hero">
        <p className="eyebrow">DM Keith tool</p>
        <h1>DM Keith Price-Free Printout Tool</h1>
        <p className="intro">
          Paste a DM Keith used-car advert link and create a clean A4 printout without the visible price.
        </p>

        <form onSubmit={handleSubmit} className="form">
          <label htmlFor="vehicle-link">DM Keith vehicle advert link</label>
          <textarea
            id="vehicle-link"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Paste DM Keith vehicle link here"
            rows={4}
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Creating printout...' : 'Create Price-Free Printout'}
          </button>
        </form>

        {error ? <div className="error">{error}</div> : null}

        {downloadUrl ? (
          <div className="result">
            <h2>A4 printout ready</h2>
            <p>The visible price area has been neatly removed. Check the preview, then download or print.</p>
            <div className="actions">
              <a href={downloadUrl} download={fileName}>Download PDF</a>
              <button type="button" onClick={printPdf}>Print PDF</button>
              <button type="button" onClick={resetForm}>Try another vehicle</button>
            </div>
            <iframe src={downloadUrl} title="Price-free A4 PDF preview" />
          </div>
        ) : null}
      </section>

      <section className="note">
        <strong>Important:</strong> this creates a clean showroom printout by visually covering the price area on the PDF.
      </section>
    </main>
  );
}
