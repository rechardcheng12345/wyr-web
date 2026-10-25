import { ArrowRight, BadgeCheck, HeartHandshake, MessageCircle, PackageCheck, Store } from "lucide-react";
import { Link } from "react-router-dom";
import { LOGO_SRC, useSiteInfo, whatsappLink } from "@/lib/site";

const VALUES = [
  { icon: PackageCheck, title: "Stock you can count on", body: "We keep popular chips and readers on the shelf in Kuala Lumpur, so most orders ship the next working day." },
  { icon: BadgeCheck, title: "Genuine, tested chips", body: "NXP NTAG and MIFARE, Impinj UHF inlays and more, checked before they go out." },
  { icon: HeartHandshake, title: "Help choosing", body: "Not sure which chip or reader fits your project? Tell us what it's for and we'll recommend one." },
];

const WHAT_WE_SELL = [
  "NFC tags, stickers and coins (NTAG213 / 215 / 216)",
  "RFID access cards and key fobs (MIFARE, EM4100)",
  "UHF RFID labels and readers",
  "USB NFC and smart card readers / writers",
  "Tap-to-review and social media NFC standees",
];

export function AboutPage() {
  const site = useSiteInfo();
  const whatsapp = whatsappLink(site.whatsappNumber, "Hi WYR Technology, I have a question.");

  return (
    <>
      <title>About us · WYR Technology</title>
      <section className="bg-brand-navy relative overflow-hidden text-white">
        <div className="bg-brand-orange/30 absolute -top-20 right-0 size-72 rounded-full blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-20">
          <p className="text-brand-orange text-xs font-semibold tracking-[0.14em] uppercase">About us</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">Making NFC and RFID easy to buy in Malaysia</h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            WYR Technology supplies NFC tags, RFID cards, readers and smart tap products to shops, offices, event organisers and makers across Malaysia.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Who we are</h2>
          <div className="text-muted-foreground mt-5 space-y-4 leading-relaxed">
            <p>
              We're a Kuala Lumpur based team focused on contactless technology. Whether you need a handful of NFC stickers for a personal project or thousands of access cards
              for a building, we want ordering to be simple: clear prices, local stock and quick delivery.
            </p>
            <p>
              Besides this website, you'll find us on Shopee and Lazada, so you can buy wherever you're most comfortable. For bigger orders, custom printing or encoding, talk to us
              directly and we'll put together a quote.
            </p>
          </div>
        </div>
        <div className="bg-muted/50 relative grid place-items-center overflow-hidden rounded-3xl border p-12">
          <div className="from-brand-blue/10 to-brand-orange/10 absolute inset-0 bg-gradient-to-br" />
          <img src={LOGO_SRC} alt="WYR Technology logo" className="relative w-56 max-w-full" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What we care about</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-card rounded-2xl border p-6">
              <span className="bg-brand-orange/10 text-brand-orange-deep grid size-11 place-items-center rounded-lg">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 font-semibold">{title}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 pt-20 lg:grid-cols-2">
        <div className="bg-card rounded-2xl border p-6 sm:p-8">
          <h2 className="text-xl font-bold">What we sell</h2>
          <ul className="mt-5 space-y-3">
            {WHAT_WE_SELL.map((t) => (
              <li key={t} className="flex gap-3 text-sm">
                <span className="bg-brand-orange mt-1.5 size-1.5 shrink-0 rounded-full" />
                {t}
              </li>
            ))}
          </ul>
          <Link to="/products" className="text-primary mt-6 inline-flex items-center gap-1 text-sm font-semibold hover:underline">
            Browse all products <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="from-brand-blue to-brand-navy flex flex-col justify-between rounded-2xl bg-gradient-to-br p-6 text-white sm:p-8">
          <div>
            <Store className="text-brand-orange size-8" strokeWidth={1.5} />
            <h2 className="mt-4 text-xl font-bold">Have a project in mind?</h2>
            <p className="mt-2 text-sm text-slate-200">Tell us what you're building and how many pieces you need. We usually reply within the same working day.</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="bg-brand-orange hover:bg-brand-orange-deep inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors">
                <MessageCircle className="size-4" /> WhatsApp us
              </a>
            )}
            <Link to="/contact" className="inline-flex h-11 items-center rounded-lg px-5 text-sm font-semibold ring-1 ring-white/40 hover:bg-white/10">
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
