export type Role = "admin" | "cashier";
export type OrderType = "takeaway" | "dine_in" | "delivery";

export interface Session {
  token: string;
  role: Role;
  name: string;
  user_id: string;
}

export interface PrinterSettings {
  printer: string;
  paper: 58 | 80;
  copies: number;
  auto_print: boolean;
  font_size: "small" | "medium" | "large";
  bold: boolean;
  side_margin_mm: number;
  feed_mm: number;
  show_logo: boolean;
  logo_percent: number;
  show_usd: boolean;
  show_rate: boolean;
  show_cashier: boolean;
  show_address: boolean;
  show_phone: boolean;
  show_footer: boolean;
}

export type CountMode = "totals" | "banknotes" | "closing_only";

export interface AppSettings {
  language: "ar" | "en";
  default_delivery_fee: number;
  table_count: number;
  day_cutoff_minutes: number;
  count_mode: CountMode;
  fixed_opening_usd: number;
  fixed_opening_lbp: number;
  inventory_enabled: boolean;
  expenses_enabled: boolean;
  receipt_name: string;
  receipt_phone: string;
  receipt_address: string;
  receipt_footer: string;
  printer: PrinterSettings;
  rate: number | null;
}

export interface ShiftState {
  open: boolean;
  mine: boolean;
  cashier: string | null;
  opened_at: string | null;
  count_mode: CountMode;
}

export interface Product {
  id: string;
  name: string;
  category_id: string;
  price_lbp: number;
  available: boolean;
  stock?: "ok" | "low" | "out";
}
export interface MenuGroup {
  id: string;
  name: string;
  products: Product[];
}

export interface Delivery {
  customer: string;
  phone: string;
  address: string;
  driver: string;
  requested_time: string;
  promised_time: string;
}

export interface OrderItem {
  id: string;
  product_id: string;
  name: string;
  price: number;
  qty: number;
  note: string;
  state: "draft" | "confirmed" | "voided";
  line_total: number;
}

export interface Order {
  id: string;
  type: OrderType;
  state: "draft" | "confirmed" | "completed" | "cancelled" | "refunded";
  payment_state: "unpaid" | "partial" | "paid" | "refunded";
  version: number;
  number: number | null;
  table_no: number | null;
  created_at: string;
  confirmed_at: string | null;
  items: OrderItem[];
  items_total: number;
  delivery_fee: number;
  promo: { code: string; percent: number } | null;
  discount: number;
  rounding: number;
  total: number;
  paid: number;
  due: number;
  total_usd_cents: number | null;
  due_usd_cents: number | null;
  delivery: Delivery | null;
  print_job?: string | null;
}

export interface Quote {
  rate: number;
  due: number;
  due_usd_cents: number;
  received: number;
  left: number;
  left_usd_cents: number;
  settled: boolean;
  shortfall: number;
  partial_allowed: boolean;
  overpaid: number;
  change_usd_cents: number;
  change_lbp: number;
  change_rounding: number;
  most_usd_cents: number;
}

export interface Receipt {
  shop: { name: string; phone: string; address: string; footer: string };
  status: "paid" | "unpaid" | "partial" | "refunded";
  type: OrderType;
  table_no: number | null;
  number: number;
  code: string;
  time: string;
  cashier: string;
  items: { name: string; qty: number; note: string; total: number }[];
  delivery_fee: number;
  promo: { code: string; percent: number } | null;
  discount: number;
  rounding: number;
  total: number;
  total_usd_cents: number;
  paid: number;
  due: number;
  rate: number;
  received: { usd_cents: number; lbp: number };
  change: { usd_cents: number; lbp: number };
  delivery: Delivery | null;
}

export interface Approval {
  reason: string;
  password: string;
}
