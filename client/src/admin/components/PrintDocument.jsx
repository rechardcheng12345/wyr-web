import { formatRM } from "../format";
import { PrintSheet } from "./PrintOrder";

const LOGO = "/images/logo_background_removed.png";

export const DOC_TITLE = { quotation: "Quotation", invoice: "Invoice", delivery_order: "Delivery Order" };

const printDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "");

/**
 * Prints a quotation, invoice or delivery order on A4, laid out like WYR's earlier Excel templates.
 * @param {object} props
 * @param {object} props.doc A document from /api/admin/documents.
 * @param {object} props.company `company` from the same response (address, bank info, wording).
 * @param {() => void} props.onDone
 */
export function PrintDocument({ doc, company, onDone }) {
  return (
    <PrintSheet pageCss="@page { size: A4; margin: 14mm; }" onDone={onDone}>
      <DocumentSheet doc={doc} company={company} />
    </PrintSheet>
  );
}

function DocumentSheet({ doc: d, company: c }) {
  const isDO = d.type === "delivery_order";
  const grey = "#555";
  const cell = { padding: "2mm 2.5mm", borderBottom: "1px solid #bbb", verticalAlign: "top" };
  const head = { ...cell, background: "#e5e5e5", borderTop: "2px solid #333", borderBottom: "2px solid #333", fontWeight: 600, fontSize: "9pt", textTransform: "uppercase", textAlign: "left" };
  const right = { textAlign: "right", whiteSpace: "nowrap" };
  const center = { textAlign: "center", whiteSpace: "nowrap" };

  const meta = [
    ["Date", printDate(d.docDate)],
    [`${isDO ? "DO" : DOC_TITLE[d.type]} #`, d.docNo],
    ...(isDO && d.source?.type === "invoice" ? [["Invoice #", d.source.docNo]] : []),
    ...(d.customerRef ? [[isDO ? "Your PO" : "Your ref", d.customerRef]] : []),
    ...(d.type === "quotation" && d.validUntil ? [["Valid until", printDate(d.validUntil)]] : []),
    ...(d.type === "quotation" && c.preparedBy ? [["Prepared by", c.preparedBy]] : []),
  ];

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "10pt", lineHeight: 1.4, position: "relative" }}>
      {d.status === "void" && (
        <div style={{ position: "absolute", top: "70mm", left: 0, right: 0, textAlign: "center", fontSize: "80pt", fontWeight: 700, color: "rgba(200,0,0,0.15)", transform: "rotate(-20deg)" }}>VOID</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: "10mm" }}>
        <div>
          <img src={LOGO} alt="" style={{ height: "18mm" }} />
          <div style={{ fontSize: "15pt", fontWeight: 700, color: "#1e3a8a", letterSpacing: "0.02em", textTransform: "uppercase" }}>{c.name}</div>
          {c.regNo && <div style={{ fontSize: "8.5pt", color: grey }}>({c.regNo})</div>}
          <div style={{ marginTop: "2mm", color: grey, whiteSpace: "pre-line" }}>{c.address}</div>
          {c.phone && <div style={{ color: grey }}>Phone: {c.phone}</div>}
          {c.email && <div style={{ color: grey }}>Email: {c.email}</div>}
        </div>
        <div style={{ textAlign: "right", minWidth: "70mm" }}>
          <div style={{ fontSize: "24pt", color: "#666", textTransform: isDO ? "uppercase" : "none", marginBottom: "4mm" }}>{DOC_TITLE[d.type]}</div>
          <table style={{ borderCollapse: "collapse", marginLeft: "auto" }}>
            <tbody>
              {meta.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ color: grey, paddingRight: "4mm", textAlign: "right", whiteSpace: "nowrap" }}>{k}:</td>
                  <td style={{ fontWeight: 600, textAlign: "right" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: "7mm", maxWidth: "105mm" }}>
        <div style={{ fontWeight: 700 }}>{isDO ? "Deliver To:" : "Bill To:"}</div>
        <div style={{ fontWeight: 600 }}>{d.billToName}</div>
        {d.billToAddress && <div style={{ whiteSpace: "pre-line" }}>{d.billToAddress}</div>}
        {d.attention && <div style={{ marginTop: "1mm" }}>Attn: {d.attention}</div>}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "7mm" }}>
        <thead>
          <tr>
            <th style={{ ...head, width: "8mm", ...center }}>No</th>
            <th style={head}>Description</th>
            {!isDO && <th style={{ ...head, ...right }}>Unit price (RM)</th>}
            <th style={{ ...head, ...center }}>Quantity</th>
            {!isDO && <th style={{ ...head, ...right }}>Amount (RM)</th>}
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={l.id ?? i}>
              <td style={{ ...cell, ...center }}>{i + 1}</td>
              <td style={cell}>
                <div style={{ whiteSpace: "pre-line" }}>{l.description}</div>
                {l.note && <div style={{ fontStyle: "italic", color: grey, marginTop: "0.5mm", whiteSpace: "pre-line" }}>{l.note}</div>}
              </td>
              {!isDO && <td style={{ ...cell, ...right }}>{money(l.unitPrice)}</td>}
              <td style={{ ...cell, ...center }}>{l.qty}</td>
              {!isDO && <td style={{ ...cell, ...right }}>{money(l.unitPrice * l.qty)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {!isDO && (
        <table style={{ borderCollapse: "collapse", marginLeft: "auto", marginTop: "3mm", minWidth: "75mm" }}>
          <tbody>
            {d.type === "invoice" && (
              <>
                <TotalRow label="Subtotal" value={formatRM(d.subtotal)} />
                {d.otherAmount !== 0 && <TotalRow label={d.otherLabel || "Other"} value={formatRM(d.otherAmount)} />}
              </>
            )}
            <TotalRow label="Total" value={formatRM(d.total)} strong />
            {d.type === "invoice" && d.paidAt && <TotalRow label="Paid" value={printDate(d.paidAt)} />}
          </tbody>
        </table>
      )}

      {d.notes && (
        <div style={{ marginTop: "6mm", whiteSpace: "pre-line" }}>
          <div style={{ fontWeight: 700 }}>Remarks</div>
          {d.notes}
        </div>
      )}

      {d.type === "quotation" && c.quotationTerms && <div style={{ marginTop: "6mm", whiteSpace: "pre-line", color: grey }}>{c.quotationTerms}</div>}

      {d.type === "invoice" && (
        <div style={{ marginTop: "8mm" }}>
          {c.bankInfo && (
            <div style={{ whiteSpace: "pre-line" }}>
              <div style={{ fontWeight: 700 }}>Bank Information</div>
              {c.bankInfo}
            </div>
          )}
          <div style={{ marginTop: "4mm", color: grey }}>
            If you have any questions concerning this invoice, contact us
            {c.phone ? ` at ${c.phone}` : ""}
            {c.email ? `${c.phone ? " or" : " at"} ${c.email}` : ""}.
          </div>
        </div>
      )}

      {isDO ? (
        <div style={{ marginTop: "14mm", width: "80mm", textAlign: "center", color: grey }}>
          <div>I/We have received the items in good order and condition.</div>
          <div style={{ borderBottom: "1px solid #000", height: "20mm" }} />
          <div style={{ fontWeight: 700, marginTop: "2mm" }}>Authorised Signature &amp; Company Stamp</div>
          <div style={{ textAlign: "left", marginTop: "4mm" }}>Name:</div>
          <div style={{ textAlign: "left", marginTop: "3mm" }}>Date:</div>
        </div>
      ) : (
        <div style={{ marginTop: "8mm", textAlign: "center", fontWeight: 700, fontStyle: d.type === "invoice" ? "italic" : "normal" }}>THANK YOU FOR YOUR BUSINESS!</div>
      )}

      {d.type === "invoice" && c.invoiceFooter && <div style={{ marginTop: "6mm", textAlign: "center", fontSize: "8.5pt", color: grey, whiteSpace: "pre-line" }}>{c.invoiceFooter}</div>}
    </div>
  );
}

const amount = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => amount.format(n);

function TotalRow({ label, value, strong }) {
  const style = { padding: "1.5mm 2.5mm", ...(strong ? { fontWeight: 700, background: "#e5e5e5", borderTop: "2px solid #333", borderBottom: "2px solid #333" } : { borderBottom: "1px solid #bbb" }) };
  return (
    <tr>
      <td style={{ ...style, textTransform: "uppercase" }}>{label}</td>
      <td style={{ ...style, textAlign: "right", whiteSpace: "nowrap" }}>{value}</td>
    </tr>
  );
}
