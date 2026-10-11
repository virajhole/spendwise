import type { FinanceDetails, PaymentMethod } from "../db/types";
import { PAYMENT_LABELS } from "../utils/finance";

export default function PaymentFields({ value, onChange, repayment = false }: { value: FinanceDetails; onChange: (value: FinanceDetails) => void; repayment?: boolean }) {
  return <div className="space-y-3">
    <label className="field-label">Payment method
      <select className="field" value={value.paymentMethod} onChange={e => onChange({ ...value, paymentMethod: e.target.value as PaymentMethod })}>
        {Object.entries(PAYMENT_LABELS).filter(([key]) => !repayment || !["credit", "unknown"].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    {(value.paymentMethod === "credit" || value.kind === "card_payment") && <label className="field-label">Card name
      <input required className="field" maxLength={60} placeholder="e.g. HDFC Millennia" value={value.cardName ?? ""} onChange={e => onChange({ ...value, cardName: e.target.value })} />
    </label>}
  </div>;
}
