# QuoteFlow

QuoteFlow is a mobile-first quotation and invoice app that opens straight into the dashboard with no login page. Business email plus business phone act as the shared workspace identity inside Business settings, so the same business can restore saved settings, clients, catalog items, quotations, invoices, logos, and next document numbers on another device.

## What It Does

- Opens directly to the dashboard with no separate sign-in page
- Connects shared records when the same business email and phone are entered
- Saves business settings, clients, catalog items, logos, quotations, and invoices
- Generates quotation and invoice numbers from the latest shared business counter
- Allows manual quotation and invoice number edits when the number is unique
- Splits records into Saved Quotations and Saved Invoices
- Converts quotations into invoices
- Exports PDFs and supports WhatsApp sharing
- Works as a responsive web app and an installable PWA

## Storage

- In local development and local preview, the API stores shared business workspaces as JSON files under `server/data/business-workspaces`.
- On Netlify, the API uses Netlify Blobs through `@netlify/blobs`, so records are site-scoped and available across devices.
- Browser local storage is still used as a fallback before a business identity is connected and for the local theme preference.

## Tech Stack

- React 19
- Vite
- TypeScript
- Tailwind CSS
- React Hook Form
- Zustand
- Netlify Functions + Netlify Blobs
- jsPDF + html2canvas
- vite-plugin-pwa

## Run The App

### Local development

```bash
npm run dev
```

This starts both the Vite client and the local QuoteFlow API. Open the Vite URL shown in the terminal.

### Local network/mobile testing

```bash
npm run dev:host
```

Use the hosted Vite URL on a phone connected to the same network.

### Production-like local preview

```bash
npm run build
npm run preview:prod
```

Then open:

- `http://localhost:4173`

## Netlify Deployment

### Settings

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Environment variables: none are required for Netlify Blobs in normal Netlify Functions runtime

## How To Test Production Locally

1. Run `npm run build`.
2. Run `npm run preview:prod`.
3. Open `http://localhost:4173`.
4. Go to Settings and enter a business email plus phone number.
5. Save a quotation or invoice.
6. Open Records and confirm it appears under Saved Quotations or Saved Invoices.
7. Open Settings and confirm clients, saved items, documents, and next numbers are counted.
8. Enter the same business email and phone on another device/browser and confirm the same records load.

## Production Checklist

- Dashboard loads without any sign-in page
- Business email and phone connect the correct shared workspace
- Saved quotations and invoices can be opened, edited, duplicated, downloaded, shared, converted, and deleted
- Manual document numbers are accepted only when unique
- Next quotation and invoice numbers continue from the latest shared counter
- No horizontal scrolling on a phone-width viewport
- Buttons and inputs are easy to tap
- PDF export still works
- PWA install still works
- Refreshing after deploy still shows the latest build, not a stale cached shell
