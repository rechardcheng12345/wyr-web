import { ExternalLink, MapPin, MessageCircle, Send, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSiteInfo, whatsappLink } from "@/lib/site";

const TOPICS = ["Product question", "Bulk / business quote", "Order help", "Something else"];

export function ContactPage() {
  const site = useSiteInfo();
  const [form, setForm] = useState({ name: "", company: "", topic: TOPICS[0], message: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const chat = whatsappLink(site.whatsappNumber, "Hi WYR Technology, I have a question.");

  function onSubmit(e) {
    e.preventDefault();
    const lines = [
      `Hi WYR Technology, I'm ${form.name.trim()}${form.company.trim() ? ` from ${form.company.trim()}` : ""}.`,
      `Topic: ${form.topic}`,
      "",
      form.message.trim(),
    ];
    const url = whatsappLink(site.whatsappNumber, lines.join("\n"));
    if (url) window.open(url, "_blank", "noopener");
  }

  const fieldClass =
    "border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm";

  return (
    <>
      <title>Contact us · WYR Technology</title>
      <section className="bg-brand-navy relative overflow-hidden text-white">
        <div className="bg-brand-orange/30 absolute -top-20 right-0 size-72 rounded-full blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-20">
          <p className="text-brand-orange text-xs font-semibold tracking-[0.14em] uppercase">Contact us</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">We're happy to help</h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">Questions about a chip, a bulk order or an existing order? WhatsApp is the fastest way to reach us.</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 pt-12 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ContactCard icon={MessageCircle} title="WhatsApp" highlight>
            <p>Chat with us for product advice, quotes and order help.</p>
            {chat ? (
              <a href={chat} target="_blank" rel="noreferrer" className="bg-brand-orange hover:bg-brand-orange-deep mt-4 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition-colors">
                <MessageCircle className="size-4" /> Start a chat
              </a>
            ) : (
              <p className="mt-2 text-xs">Number coming soon.</p>
            )}
          </ContactCard>
          {site.shopeeUrl && (
            <ContactCard icon={ShoppingBag} title="Shopee store">
              <p>Prefer marketplace vouchers? Message or order from our Shopee shop.</p>
              <a href={site.shopeeUrl} target="_blank" rel="noreferrer" className="text-shopee mt-3 inline-flex items-center gap-1 text-sm font-semibold hover:underline">
                Visit our Shopee store <ExternalLink className="size-3.5" />
              </a>
            </ContactCard>
          )}
          <ContactCard icon={MapPin} title="Location">
            <p>Kuala Lumpur, Malaysia</p>
            <p className="mt-1">Orders ship nationwide, to Peninsular and East Malaysia.</p>
          </ContactCard>
        </div>

        <div className="bg-card rounded-2xl border p-6 sm:p-8 lg:col-span-3">
          <h2 className="text-xl font-bold">Send us a message</h2>
          <p className="text-muted-foreground mt-1 text-sm">This opens WhatsApp with your message filled in, ready to send.</p>
          <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Your name
              <Input required value={form.name} onChange={set("name")} autoComplete="name" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>
                Company <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </span>
              <Input value={form.company} onChange={set("company")} autoComplete="organization" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
              What's it about?
              <select value={form.topic} onChange={set("topic")} className={`${fieldClass} h-9`}>
                {TOPICS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
              Message
              <textarea
                required
                rows={6}
                value={form.message}
                onChange={set("message")}
                placeholder="e.g. 500 pcs NTAG215 round stickers, 25mm, encoded with our website link"
                className={`${fieldClass} py-2`}
              />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" size="lg" disabled={!site.whatsappNumber} className="bg-brand-orange hover:bg-brand-orange-deep w-full sm:w-auto">
                <Send /> Send via WhatsApp
              </Button>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}

function ContactCard({ icon: Icon, title, highlight, children }) {
  return (
    <div className={highlight ? "border-brand-orange/40 bg-brand-orange/5 rounded-2xl border p-6" : "bg-card rounded-2xl border p-6"}>
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
          <Icon className="size-5" />
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="text-muted-foreground mt-3 text-sm">{children}</div>
    </div>
  );
}
