import localFont from "next/font/local";
import "../globals.css";
import Providers from "../providers";
import "bootstrap/dist/css/bootstrap.min.css";

const geistSans = localFont({
  src: "../fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "../fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`}>
      <Providers>
        <main className="container py-4">{children}</main>
      </Providers>
    </div>
  );
}
