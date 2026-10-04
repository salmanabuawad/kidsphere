import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import { getI18n } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

// Rubik covers Latin, Arabic and Hebrew with one consistent voice.
const rubik = Rubik({ variable: "--font-rubik", subsets: ["latin", "arabic", "hebrew"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Kidsphere", template: "%s · Kidsphere" },
  description: "Personalized early-childhood learning, guided by teachers and families.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f766e",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, dir } = await getI18n();
  return (
    <html lang={locale} dir={dir} className={`${rubik.variable} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider locale={locale}>
          {children}
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
