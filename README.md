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

### Preview your live records locally (read-only)

The ordinary development preview uses local JSON files, so matching email/phone details do not connect it to the Vercel data. To preview the updated interface with existing live records, run `npm run preview:recovery` and open `http://127.0.0.1:5174/auth`. This uses a separate local API on port 8877, reads the live `/api/bootstrap` endpoint, and blocks all writes and new accounts. Large workspaces may take several minutes to load. No deployment or Blob credentials are needed. Stop the preview with Ctrl+C.

The recovery preview requires the live API and an internet connection. It never substitutes local records or creates an empty workspace on failure. PDF downloads work without writing share history. The existing live app's email/phone ownership-verification limitation still applies; this preview does not add authentication.

For recovery fixes, advanced Records search, test commands, and the prepared email-verification rollout, see [Recovery and search](docs/recovery-and-search.md). In Settings, use **Recover / retry business workspace** after entering contact details. If no matching business exists, verify the details before choosing **Create new business**.

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
