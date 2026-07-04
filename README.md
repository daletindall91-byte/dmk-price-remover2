# DM Keith Price Remover

A small Next.js app for creating a clean customer printout from a DM Keith used car advert link.

Paste a normal DM Keith vehicle advert URL, and the app will:

1. Detect the stock ID from the advert link.
2. Build the matching DM Keith print PDF link.
3. Download the PDF server-side.
4. Visually cover the price area.
5. Return a new PDF for download or printing.

## Deploy settings for Vercel

Use these settings:

```text
Framework Preset: Next.js
Root Directory: ./
Build Command: npm run build
Install Command: npm install
Output Directory: leave blank
```

## Important

This visually covers the price for printing. It is not a legal redaction tool for confidential documents.
