This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Address provider

Address autocomplete is selected entirely through server environment variables. Google remains the default when `ADDRESS_PROVIDER` is omitted.

```env
ADDRESS_PROVIDER=geoapify
GEOAPIFY_API_KEY=xxxxxxxx
```

Or:

```env
ADDRESS_PROVIDER=google
GOOGLE_PLACES_API_KEY=xxxxxxxx
```

Only the key for the selected provider is required. Keys must remain server-only; do not prefix them with `NEXT_PUBLIC_`.

Geoapify uses `GET https://api.geoapify.com/v1/geocode/autocomplete` followed by `GET https://api.geoapify.com/v2/place-details` after selection. Its suggestions include links for OpenStreetMap attribution and, where required by the subscription, Geoapify attribution.
