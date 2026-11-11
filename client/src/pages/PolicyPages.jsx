import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { formatPrice } from "@/lib/utils";
import { usePageMeta, useSiteInfo, whatsappLink } from "@/lib/site";

// Shipping, Returns & refunds, Privacy and Terms. The numbers in them (fees, dispatch cut-off,
// delivery and return days) and the business details come from the admin settings via /api/site,
// the same values server/src/merchant.js gives Google, so the pages and Google never disagree.

const UPDATED = "11 November 2026";

/** 15 -> "3pm", 0 -> "midnight", 12 -> "12 noon". */
export function hourText(h) {
  if (h === 0) return "midnight";
  if (h === 12) return "12 noon";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export const dayRangeText = ([min, max]) => (min === max ? `${min} working day${min === 1 ? "" : "s"}` : `${min} to ${max} working days`);

/** "WYR Technology (202403123456)" when a registration number is set. */
export function legalName(business) {
  if (!business) return "WYR Technology";
  return business.regNo ? `${business.name} (${business.regNo})` : business.name;
}

export const telHref = (phone) => `tel:${phone.replace(/[^\d+]/g, "").replace(/^0/, "+60")}`;

/** Registered name, address, phone, email and hours, as set in the admin. */
export function BusinessDetails({ className = "" }) {
  const site = useSiteInfo();
  const b = site.business;
  if (!b) return null;
  const chat = whatsappLink(site.whatsappNumber, "Hi WYR Technology, I have a question.");
  const row = "flex gap-3";
  const icon = "text-muted-foreground mt-0.5 size-4 shrink-0";
  return (
    <div className={`space-y-3 text-sm ${className}`} data-testid="business-details">
      <p className="font-semibold">{legalName(b)}</p>
      <p className={row}>
        <MapPin className={icon} />
        <span className="whitespace-pre-line">{b.address}</span>
      </p>
      {b.phone && (
        <p className={row}>
          <Phone className={icon} />
          <a href={telHref(b.phone)} className="hover:underline">
            {b.phone}
          </a>
        </p>
      )}
      {chat && (
        <p className={row}>
          <MessageCircle className={icon} />
          <a href={chat} target="_blank" rel="noreferrer" className="hover:underline">
            WhatsApp +{site.whatsappNumber}
          </a>
        </p>
      )}
      {b.email && (
        <p className={row}>
          <Mail className={icon} />
          <a href={`mailto:${b.email}`} className="break-all hover:underline">
            {b.email}
          </a>
        </p>
      )}
      {b.hours && (
        <p className={row}>
          <Clock className={icon} />
          <span>{b.hours}</span>
        </p>
      )}
    </div>
  );
}

function PolicyPage({ eyebrow, title, intro, metaTitle, metaDescription, children }) {
  usePageMeta(metaTitle, metaDescription);
  return (
    <>
      <title>{metaTitle}</title>
      <section className="bg-brand-navy relative overflow-hidden text-white">
        <div className="bg-brand-orange/30 absolute -top-20 right-0 size-72 rounded-full blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-14 md:py-16">
          <p className="text-brand-orange text-xs font-semibold tracking-[0.14em] uppercase">{eyebrow}</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">{intro}</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-12 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="min-w-0 space-y-10">
          {children}
          <p className="text-muted-foreground border-t pt-6 text-xs">Last updated {UPDATED}.</p>
        </article>
        <aside className="h-fit lg:sticky lg:top-24">
          <div className="bg-card rounded-2xl border p-6">
            <h2 className="font-semibold">Questions?</h2>
            <p className="text-muted-foreground mt-1 mb-4 text-sm">Contact us, we usually reply within the same working day.</p>
            <BusinessDetails />
          </div>
          <nav className="mt-4 flex flex-col gap-1 px-2 text-sm" aria-label="Policies">
            {POLICY_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="text-muted-foreground hover:text-foreground py-1">
                {l.label}
              </Link>
            ))}
          </nav>
        </aside>
      </div>
    </>
  );
}

export const POLICY_LINKS = [
  { to: "/shipping", label: "Shipping policy" },
  { to: "/returns", label: "Returns & refunds" },
  { to: "/privacy", label: "Privacy policy" },
  { to: "/terms", label: "Terms & conditions" },
];

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      <div className="text-muted-foreground mt-4 space-y-3 leading-relaxed [&_a]:text-primary [&_a]:underline-offset-2 [&_a:hover]:underline [&_li]:pl-1 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

function feeText(shipping) {
  if (!shipping) return null;
  if (shipping.westRm === shipping.eastRm) return <>a flat {formatPrice(shipping.westRm)} per order anywhere in Malaysia</>;
  return (
    <>
      {formatPrice(shipping.westRm)} per order to Peninsular Malaysia and {formatPrice(shipping.eastRm)} per order to Sabah, Sarawak and Labuan
    </>
  );
}

export function ShippingPolicyPage() {
  const site = useSiteInfo();
  const p = site.policies;
  const shipping = site.shipping;
  return (
    <PolicyPage
      eyebrow="Shipping"
      title="Shipping policy"
      intro="We ship from Kuala Lumpur to every state in Malaysia. Here's what it costs and how long it takes."
      metaTitle="Shipping policy · WYR Technology"
      metaDescription="Shipping fees, dispatch times and delivery times for WYR Technology orders across Peninsular and East Malaysia."
    >
      <Section title="Where we ship">
        <p>
          We deliver anywhere in Malaysia: Peninsular Malaysia, Sabah, Sarawak and W.P. Labuan. We don't ship outside Malaysia at the moment. If you need an overseas delivery,{" "}
          <Link to="/contact">contact us</Link> first.
        </p>
      </Section>
      <Section title="Shipping fees">
        {shipping ? (
          <p>
            Shipping is {feeText(shipping)}.
            {shipping.freeThresholdRm != null && (
              <>
                {" "}
                Orders with a subtotal of <strong>{formatPrice(shipping.freeThresholdRm)}</strong> or more ship <strong>free</strong>.
              </>
            )}{" "}
            The exact fee is shown at checkout before you pay.
          </p>
        ) : (
          <p>The shipping fee is shown at checkout before you pay.</p>
        )}
      </Section>
      {p && (
        <Section title="When we ship">
          <ul>
            <li>
              Orders paid before <strong>{hourText(p.dispatchCutoffHour)}</strong> on a working day are packed and handed to the courier <strong>the same day</strong>.
            </li>
            <li>Orders paid after that, or on weekends and public holidays, ship the next working day.</li>
            <li>Working days are Monday to Friday, except Malaysian public holidays.</li>
            <li>Custom-printed or custom-encoded orders ship on the date we agree with you in the quotation.</li>
          </ul>
        </Section>
      )}
      {p && (
        <Section title="Delivery times">
          <p>After your parcel leaves us, the courier usually delivers it in:</p>
          <ul>
            <li>
              <strong>Peninsular Malaysia:</strong> {dayRangeText(p.deliveryWestDays)}
            </li>
            <li>
              <strong>Sabah, Sarawak and Labuan:</strong> {dayRangeText(p.deliveryEastDays)}
            </li>
          </ul>
          {p.couriers && <p>We ship with {p.couriers}.</p>}
          <p>Remote areas, festive seasons and bad weather can add a few days. These times are the courier's estimates, not guarantees.</p>
        </Section>
      )}
      <Section title="Tracking your order">
        <p>
          Once your order ships we add the courier and tracking number to it. You can see them under <Link to="/account/orders">My account</Link>, or on{" "}
          <Link to="/track">Track order</Link> with your order number and email.
        </p>
      </Section>
      <Section title="Lost or damaged parcels">
        <p>
          If your parcel arrives damaged, or hasn't arrived well after the delivery time above, contact us{p && <> within {p.returnDays} days</>}. We'll sort it out with
          the courier and send a replacement or refund you. See <Link to="/returns">Returns &amp; refunds</Link>.
        </p>
      </Section>
    </PolicyPage>
  );
}

export function ReturnsPolicyPage() {
  const site = useSiteInfo();
  const p = site.policies;
  const days = p ? `${p.returnDays} days` : "the days stated below";
  return (
    <PolicyPage
      eyebrow="Returns & refunds"
      title="Returns & refunds"
      intro="If something arrives faulty, damaged or not what you ordered, we'll replace it or refund you, and we pay the return shipping."
      metaTitle="Returns & refunds · WYR Technology"
      metaDescription="How to return a defective, damaged or wrong item from WYR Technology, and how refunds are paid."
    >
      <Section title="What you can return">
        <p>
          Tell us within <strong>{days} of delivery</strong> if an item:
        </p>
        <ul>
          <li>is defective or doesn't work as described (for example, a tag that can't be read or written, or a reader that isn't detected),</li>
          <li>arrived damaged, or</li>
          <li>isn't what you ordered (wrong item, wrong chip type or missing pieces).</li>
        </ul>
        <p>We'll replace it, or refund it in full including the shipping you paid for it, whichever you prefer. A replacement depends on stock.</p>
      </Section>
      <Section title="What we can't accept">
        <ul>
          <li>Change-of-mind returns, or items bought by mistake, when the item is working and as described.</li>
          <li>Items damaged after delivery through misuse, for example tags bent, cut, heated or exposed to liquids beyond their rating.</li>
          <li>
            Tags you have locked (made read-only) yourself. Locking is permanent, so please test your data before locking. A tag that was faulty before you locked it is still
            covered.
          </li>
          <li>Custom-printed or custom-encoded items made to your order, unless they are faulty or not made as we agreed.</li>
        </ul>
        <p>Not sure which chip or reader you need? Ask us before you order and we'll help you choose.</p>
      </Section>
      <Section title="How to return an item">
        <ul>
          <li>
            Contact us by WhatsApp or email within {days} of delivery with your <strong>order number</strong> and a <strong>photo or short video</strong> showing the problem.
          </li>
          <li>We reply within one working day. Often we can fix a setup problem over chat. If not, we'll give you the return address and instructions.</li>
          <li>
            <strong>We pay the return shipping</strong> for approved returns. We either arrange the pickup or refund your postage when the item arrives.
          </li>
          <li>Please send the item back with all its parts within 14 days of our approval.</li>
        </ul>
      </Section>
      <Section title="Refunds">
        <ul>
          <li>
            We refund to your original payment method (the bank account you paid from with FPX) within{" "}
            <strong>{p ? `${p.refundDays} working days` : "a few working days"}</strong> of approving your return. For damaged or missing items we may refund you without asking for the item
            back.
          </li>
          <li>Your bank may take a few more days to show the money in your account.</li>
          <li>We'll message you when the refund has been sent.</li>
        </ul>
      </Section>
      <Section title="Cancelling an order">
        <p>
          You can cancel any time before your order ships: contact us and we'll refund it in full. Unpaid orders cancel themselves after a short time. Once an order has shipped, the
          return rules above apply.
        </p>
      </Section>
      <Section title="Orders from Shopee or Lazada">
        <p>Orders placed on our Shopee or Lazada stores follow that marketplace's own return and refund process. Please request the return in their app.</p>
      </Section>
      <Section title="Your rights">
        <p>This policy doesn't affect your rights under Malaysia's Consumer Protection Act 1999.</p>
      </Section>
    </PolicyPage>
  );
}

export function PrivacyPolicyPage() {
  const site = useSiteInfo();
  const b = site.business;
  return (
    <PolicyPage
      eyebrow="Privacy"
      title="Privacy policy"
      intro="What personal data we collect when you shop with us, why, and what you can ask us to do with it."
      metaTitle="Privacy policy · WYR Technology"
      metaDescription="What personal data WYR Technology collects, how it is used and your rights under Malaysia's PDPA."
    >
      <Section title="Who we are">
        <p>
          This website is run by <strong>{legalName(b)}</strong>, {b ? b.address.replace(/\s*\n\s*/g, ", ") : "Kuala Lumpur, Malaysia"}. We handle your personal data in line with
          Malaysia's Personal Data Protection Act 2010 (PDPA).
        </p>
      </Section>
      <Section title="What we collect">
        <ul>
          <li>
            <strong>When you order:</strong> your name, phone number, email address, delivery address, company name (if you give one) and what you bought.
          </li>
          <li>
            <strong>When you create an account:</strong> the same details, plus your password, which we store only in scrambled (hashed) form.
          </li>
          <li>
            <strong>When you contact us:</strong> what you tell us by WhatsApp, email or phone.
          </li>
          <li>
            <strong>Payments:</strong> you pay on ToyyibPay's secure page. We see whether your payment succeeded and its reference, but never your online banking login or card details.
          </li>
        </ul>
      </Section>
      <Section title="How we use it">
        <ul>
          <li>to process, pack and deliver your order, and to send you its status and tracking details,</li>
          <li>to reply to your questions and handle returns and refunds,</li>
          <li>to issue invoices and keep the business and tax records the law requires,</li>
          <li>to keep the website and your account secure.</li>
        </ul>
        <p>We don't sell or rent your personal data. We only send you promotions if you've asked to receive them, and you can stop them any time.</p>
      </Section>
      <Section title="Who we share it with">
        <p>Only with the companies that help us serve you, and only what they need:</p>
        <ul>
          <li>courier companies, to deliver your parcel (name, phone and address),</li>
          <li>ToyyibPay, to take your payment,</li>
          <li>the services we use to host this website and manage orders and stock.</li>
        </ul>
        <p>We may also share data when the law requires it, for example with government authorities.</p>
      </Section>
      <Section title="Cookies and browser storage">
        <p>
          We use a small number of cookies and browser storage to keep you logged in and to remember your cart. We don't use advertising or tracking cookies.
        </p>
      </Section>
      <Section title="How long we keep it">
        <p>
          We keep order records for as long as Malaysian accounting and tax law requires (currently 7 years), and account details until you ask us to close your account.
        </p>
      </Section>
      <Section title="Your rights">
        <p>
          Under the PDPA you can ask to see the personal data we hold about you, correct it, or withdraw your consent to us using it (which may mean we can't fulfil an order). Contact us
          {b?.email && (
            <>
              {" "}
              at <a href={`mailto:${b.email}`}>{b.email}</a>
            </>
          )}{" "}
          and we'll respond within 21 days.
        </p>
      </Section>
      <Section title="Changes">
        <p>If we change this policy we'll update the date below. Significant changes will also be shown on the website.</p>
      </Section>
    </PolicyPage>
  );
}

export function TermsPage() {
  const site = useSiteInfo();
  const b = site.business;
  return (
    <PolicyPage
      eyebrow="Terms"
      title="Terms & conditions"
      intro="The terms that apply when you buy from this website. Please read them with our shipping and returns policies."
      metaTitle="Terms & conditions · WYR Technology"
      metaDescription="The terms that apply when you buy from WYR Technology: orders, prices, payment, delivery and returns."
    >
      <Section title="About us">
        <p>
          This website (wyrgadget.com) is operated by <strong>{legalName(b)}</strong>, {b ? b.address.replace(/\s*\n\s*/g, ", ") : "Kuala Lumpur, Malaysia"}. By placing an order you agree to
          these terms.
        </p>
      </Section>
      <Section title="Products and prices">
        <ul>
          <li>
            Prices are in Ringgit Malaysia (RM). The price you pay is the one shown in your cart at checkout. Shipping is added at checkout and shown before you pay.
          </li>
          <li>Some low-priced items have a minimum quantity, and larger quantities may get a lower price per piece. Both are shown on the product page.</li>
          <li>
            We describe our products as accurately as we can. Photos show the product, but colours and print can vary slightly. NFC products need an NFC-capable phone or reader: check the
            compatibility on the product page, or ask us.
          </li>
          <li>If a price or description is clearly wrong because of an error, we'll contact you before shipping and you can cancel for a full refund.</li>
        </ul>
      </Section>
      <Section title="Orders and payment">
        <ul>
          <li>You pay securely through ToyyibPay. Your order is confirmed once the payment is confirmed, and we'll show you the order number.</li>
          <li>We hold the items for a short time while you pay. Unpaid orders are cancelled automatically.</li>
          <li>
            If an item turns out to be out of stock after you've paid, we'll tell you and refund you in full, or ship it later if you'd rather wait.
          </li>
          <li>For bulk, custom-printed or custom-encoded orders, the price and delivery date in our written quotation apply.</li>
        </ul>
      </Section>
      <Section title="Delivery, returns and refunds">
        <p>
          Delivery is covered by our <Link to="/shipping">Shipping policy</Link>, and returns, refunds and cancellations by our <Link to="/returns">Returns &amp; refunds</Link> policy.
        </p>
      </Section>
      <Section title="Your account">
        <p>Keep your password private. You're responsible for orders placed from your account. Tell us straight away if you think someone else has used it.</p>
      </Section>
      <Section title="Liability">
        <p>
          As far as the law allows, our liability for any order is limited to the amount you paid for it, and we aren't liable for indirect losses. Nothing in these terms limits your rights
          under the Consumer Protection Act 1999 or any other law that can't be excluded.
        </p>
      </Section>
      <Section title="Privacy">
        <p>
          How we handle your personal data is explained in our <Link to="/privacy">Privacy policy</Link>.
        </p>
      </Section>
      <Section title="Law">
        <p>These terms are governed by the laws of Malaysia. If we change them, the version on this page when you placed your order applies to that order.</p>
      </Section>
    </PolicyPage>
  );
}
