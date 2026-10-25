import { ChevronDown, FileText, Printer, Tag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { LOGO_SRC } from "@/lib/site";
import { formatRM } from "../format";

const PAGE_CSS = {
  details: "@page { size: A4; margin: 14mm; }",
  waybill: "@page { size: 100mm 150mm; margin: 0; }",
};

/**
 * "Print" button with a menu: order details (A4 packing slip) or waybill (100×150mm recipient label).
 * @param {object} props
 * @param {object} props.order An order from /api/admin/orders.
 */
export function PrintMenu({ order }) {
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function start(type) {
    setOpen(false);
    setJob(type);
  }

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Printer />
        Print
        <ChevronDown className="opacity-60" />
      </Button>
      {open && (
        <div role="menu" className="bg-card absolute left-0 bottom-full z-20 mb-2 w-56 overflow-hidden rounded-lg border p-1 shadow-lg">
          <MenuItem icon={FileText} title="Order details" hint="A4 packing slip" onClick={() => start("details")} />
          <MenuItem icon={Tag} title="Waybill" hint="Recipient label, 100×150mm" onClick={() => start("waybill")} />
        </div>
      )}
      {job && <PrintJob type={job} order={order} onDone={() => setJob(null)} />}
    </div>
  );
}

function MenuItem({ icon: Icon, title, hint, onClick }) {
  return (
    <button role="menuitem" onClick={onClick} className="hover:bg-accent flex w-full items-start gap-3 rounded-md px-3 py-2 text-left">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block text-xs">{hint}</span>
      </span>
    </button>
  );
}

function PrintJob({ type, order, onDone }) {
  const rootRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const finish = () => !cancelled && onDone();
    window.addEventListener("afterprint", finish, { once: true });
    const images = [...(rootRef.current?.querySelectorAll("img") ?? [])];
    const loaded = (img) =>
      new Promise((resolve) => {
        if (img.complete) return resolve();
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    Promise.all(images.map(loaded))
      .then(() => new Promise((r) => requestAnimationFrame(r)))
      .then(() => !cancelled && window.print());
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", finish);
    };
  }, [onDone]);

  return createPortal(
    <div id="admin-print" ref={rootRef}>
      <style>{`
        @media screen { #admin-print { display: none; } }
        @media print {
          body > *:not(#admin-print) { display: none !important; }
          #admin-print { display: block; color: #000; }
          ${PAGE_CSS[type]}
          html, body { background: #fff !important; }
        }
      `}</style>
      {type === "waybill" ? <Waybill order={order} /> : <OrderDetails order={order} />}
    </div>,
    document.body,
  );
}

function addressLines(s) {
  return [s.address, [s.postcode, s.city].filter(Boolean).join(" "), s.state].filter(Boolean);
}

function Waybill({ order }) {
  const s = order.shipping;
  return (
    <div style={{ width: "100mm", height: "150mm", boxSizing: "border-box", padding: "8mm", fontFamily: "Arial, Helvetica, sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ border: "2px solid #000", borderRadius: "3mm", padding: "6mm", flex: 1, display: "flex", flexDirection: "column", gap: "5mm" }}>
        <div>
          <div style={{ fontSize: "9pt", fontWeight: 700, letterSpacing: "0.12em" }}>RECIPIENT</div>
          <div style={{ fontSize: "20pt", fontWeight: 700, lineHeight: 1.15, marginTop: "1.5mm", wordBreak: "break-word" }}>{s.name}</div>
        </div>
        <div>
          <div style={{ fontSize: "9pt", fontWeight: 700, letterSpacing: "0.12em" }}>PHONE</div>
          <div style={{ fontSize: "16pt", fontWeight: 700, marginTop: "1.5mm" }}>{s.phone}</div>
        </div>
        <div style={{ borderTop: "1px solid #000", paddingTop: "5mm" }}>
          <div style={{ fontSize: "9pt", fontWeight: 700, letterSpacing: "0.12em" }}>DESTINATION ADDRESS</div>
          <div style={{ fontSize: "14pt", lineHeight: 1.35, marginTop: "1.5mm", wordBreak: "break-word" }}>
            {addressLines(s).map((line) => (
              <div key={line}>{line}</div>
            ))}
            <div>Malaysia</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderDetails({ order: o }) {
  const s = o.shipping;
  const cell = { padding: "2.5mm 2mm", borderBottom: "1px solid #ddd", verticalAlign: "top" };
  const head = { ...cell, borderBottom: "1.5px solid #000", fontSize: "8.5pt", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "left" };
  const right = { textAlign: "right", whiteSpace: "nowrap" };
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
  const pieces = o.items.reduce((sum, i) => sum + (i.qty ?? 0), 0);

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "10pt", lineHeight: 1.4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #000", paddingBottom: "5mm" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
          <img src={LOGO_SRC} alt="" style={{ height: "11mm" }} />
          <div>
            <div style={{ fontSize: "14pt", fontWeight: 700 }}>WYR Technology</div>
            <div style={{ fontSize: "8.5pt", color: "#444" }}>Kuala Lumpur, Malaysia</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "16pt", fontWeight: 700 }}>Order details</div>
          <div style={{ fontFamily: "monospace", fontSize: "11pt", fontWeight: 700 }}>{o.orderNo}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "10mm", marginTop: "6mm" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "8.5pt", fontWeight: 700, letterSpacing: "0.08em", color: "#444" }}>SHIP TO</div>
          <div style={{ fontWeight: 700, marginTop: "1mm" }}>{s.name}</div>
          <div>{s.phone}</div>
          {addressLines(s).map((line) => (
            <div key={line}>{line}</div>
          ))}
          {o.email && <div style={{ color: "#444" }}>{o.email}</div>}
        </div>
        <div style={{ flex: 1 }}>
          <table style={{ borderCollapse: "collapse", marginLeft: "auto" }}>
            <tbody>
              {[
                ["Order date", fmt(o.createdAt)],
                ["Paid", fmt(o.paidAt)],
                ["Items", `${pieces} piece${pieces === 1 ? "" : "s"}`],
                ...(o.courier ? [["Courier", [o.courier, o.trackingNo].filter(Boolean).join(" · ")]] : []),
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ color: "#444", paddingRight: "5mm" }}>{k}</td>
                  <td style={{ fontWeight: 600 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8mm" }}>
        <thead>
          <tr>
            <th style={{ ...head, width: "6mm" }} />
            <th style={{ ...head, ...right, width: "14mm" }}>Qty</th>
            <th style={head}>Item</th>
            <th style={{ ...head, ...right }}>Unit price</th>
            <th style={{ ...head, ...right }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id}>
              <td style={cell}>
                <span style={{ display: "inline-block", width: "3.5mm", height: "3.5mm", border: "1.2px solid #000", borderRadius: "0.6mm" }} />
              </td>
              <td style={{ ...cell, ...right, fontWeight: 700, fontSize: "11pt" }}>{i.qty}</td>
              <td style={cell}>
                <div style={{ fontWeight: 600 }}>{i.productName}</div>
                <div style={{ color: "#444", fontSize: "8.5pt" }}>{[i.variantName, i.sku && `SKU ${i.sku}`].filter(Boolean).join(" · ")}</div>
              </td>
              <td style={{ ...cell, ...right }}>{formatRM(i.unitPrice)}</td>
              <td style={{ ...cell, ...right }}>{formatRM((i.unitPrice ?? 0) * (i.qty ?? 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ borderCollapse: "collapse", marginLeft: "auto", marginTop: "4mm", minWidth: "65mm" }}>
        <tbody>
          <tr>
            <td style={{ padding: "1mm 0", color: "#444" }}>Subtotal</td>
            <td style={{ padding: "1mm 0", ...right }}>{formatRM(o.subtotal)}</td>
          </tr>
          <tr>
            <td style={{ padding: "1mm 0", color: "#444" }}>Shipping</td>
            <td style={{ padding: "1mm 0", ...right }}>{formatRM(o.shippingFee)}</td>
          </tr>
          <tr>
            <td style={{ padding: "2mm 0 0", fontWeight: 700, borderTop: "1.5px solid #000" }}>Total</td>
            <td style={{ padding: "2mm 0 0", fontWeight: 700, borderTop: "1.5px solid #000", ...right }}>{formatRM(o.total)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: "12mm", fontSize: "9pt", color: "#444", textAlign: "center" }}>Thank you for shopping with WYR Technology!</div>
    </div>
  );
}
