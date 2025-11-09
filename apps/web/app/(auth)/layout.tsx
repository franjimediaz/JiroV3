import localFont from "next/font/local";
import "../globals.css";
import Providers from "../providers";
import "bootstrap/dist/css/bootstrap.min.css";

const geistSans = localFont({ src: "../fonts/GeistVF.woff", variable: "--font-geist-sans" });
const geistMono = localFont({ src: "../fonts/GeistMonoVF.woff", variable: "--font-geist-mono" });

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" defer />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>
          <main className="container py-4">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
