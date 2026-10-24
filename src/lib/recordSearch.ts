import { calculateDocumentTotalsForDocument } from "./documents";
import type { QuoteFlowDocument } from "../types";

export interface RecordFilters {
  query: string;
  type: string;
  status: string;
  from: string;
  to: string;
  sort: string;
}

function text(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Build only when records change, not on every keystroke. No embedded images or history.
export function buildRecordIndex(documents: QuoteFlowDocument[]) {
  return documents.map((document) => ({
    document,
    search: text([
      document.number, document.client.name, document.client.company,
      document.client.phone, document.client.phone.replace(/\D/g, ""), document.client.email,
      ...document.items.flatMap((item) => [item.name, item.description]),
    ].join(" ")),
    amount: calculateDocumentTotalsForDocument(document).grandTotal,
  }));
}

export function searchRecords(index: ReturnType<typeof buildRecordIndex>, filters: RecordFilters) {
  const terms = text(filters.query).split(" ").filter(Boolean);
  return index.filter(({ document, search }) =>
    terms.every((term) => search.includes(term)) &&
    (filters.type === "all" || document.type === filters.type) &&
    (filters.status === "all" || document.status === filters.status) &&
    (!filters.from || document.issueDate >= filters.from) &&
    (!filters.to || document.issueDate <= filters.to),
  ).sort((left, right) => {
    const dateOrder = right.document.issueDate.localeCompare(left.document.issueDate) ||
      right.document.createdAt.localeCompare(left.document.createdAt);
    const order = filters.sort === "oldest" ? -dateOrder :
      filters.sort === "highest" ? right.amount - left.amount :
      filters.sort === "lowest" ? left.amount - right.amount : dateOrder;
    return order || left.document.id.localeCompare(right.document.id);
  }).map(({ document }) => document);
}
