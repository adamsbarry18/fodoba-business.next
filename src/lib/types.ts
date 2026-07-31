
import { z } from "zod";
import type { FieldValue, Timestamp } from "firebase/firestore";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/constants/currencies";

export type { CurrencyCode };

/** Horodatage Firestore : Timestamp lu, FieldValue à l'écriture, Date JS ou chaîne. */
export type FirestoreDate = Timestamp | FieldValue | Date | string | { toDate?: () => Date };

export type Role = "admin" | "manager" | "seller";

export const UserProfileSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  lastName: z.string(),
  firstName: z.string(),
  role: z.enum(["admin", "manager", "seller"]),
  storeIds: z.array(z.string()),
  active: z.boolean(),
  phone: z.string().optional(),
  photoURL: z.string().optional(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export const StoreSchema = z.object({
  id: z.string(),
  code: z.string().min(2, "Le code est requis (ex: FI-B1)"),
  name: z.string().min(3, "Le nom est requis"),
  address: z.string().min(5, "L'adresse est requise"),
  phone: z.string().min(8, "Numéro de téléphone invalide"),
  active: z.boolean().default(true),
  createdAt: z.any().optional(),
});

export type Store = z.infer<typeof StoreSchema>;

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string().min(2, "Le nom est requis"),
  parentId: z.string().nullable().default(null),
  description: z.string().optional(),
  active: z.boolean().default(true),
  createdAt: z.any().optional(),
});

export type Category = z.infer<typeof CategorySchema>;

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string().min(2, "Le nom est requis"),
  sku: z.string().min(2, "Le SKU/Référence est requis"),
  barcode: z.string().optional(),
  categoryId: z.string().min(1, "La catégorie est requise"),
  imageUrl: z.string().optional(),
  /** Unité de gros (ex. Carton, Sac) */
  packagingUnit: z.string().optional(),
  /** Unité de détail / vente (ex. Pièce, Bouteille) */
  unit: z.string().min(1, "L'unité détail est requise"),
  /** Nombre d'unités détail par unité de gros */
  unitsPerPack: z.number().min(1).default(1),
  /** Quantité minimale ou facteur de vente au détail */
  retailQtyFactor: z.number().min(1).default(1),
  /** @deprecated - préférer packagingUnit + unitsPerPack */
  conditionnement: z.string().optional(),
  purchasePriceRef: z.number().min(0).default(0),
  wholesalePriceFCFA: z.number().min(0).default(0),
  sellingPriceFCFA: z.number().min(0),
  manufacturingDate: z.string().optional(),
  expirationDate: z.string().optional(),
  prices: z.object({
    GNF: z.number().optional(),
    USD: z.number().optional(),
    EUR: z.number().optional(),
  }).optional(),
  lowStockThreshold: z.number().default(10),
  active: z.boolean().default(true),
  createdAt: z.any().optional(),
});

/** Champs formulaire création (stock initial boutique active) */
export const ProductCreateFormSchema = ProductSchema.omit({
  id: true,
  createdAt: true,
  sku: true,
}).extend({
  sku: z.string().optional(),
  initialStockPackaging: z.number().min(0).default(0),
  detailStock: z.number().min(0).optional(),
});

export type Product = z.infer<typeof ProductSchema>;
export type ProductCreateFormValues = z.infer<typeof ProductCreateFormSchema>;

/** Champs formulaire édition (stock boutique active en plus du produit) */
export const ProductEditFormSchema = ProductSchema.extend({
  initialStockPackaging: z.number().min(0).default(0),
  detailStock: z.number().min(0).optional(),
});

export type ProductEditFormValues = z.infer<typeof ProductEditFormSchema>;

/** Valeurs communes aux formulaires création / édition produit */
export type ProductFormValues = Omit<Product, "id" | "createdAt" | "sku"> & {
  id?: string
  createdAt?: unknown
  sku?: string
  initialStockPackaging?: number
  detailStock?: number
}

export const StockLevelSchema = z.object({
  productId: z.string(),
  storeId: z.string(),
  /** Total en unités détail (conditionnement × ratio + détail loose) */
  quantity: z.number().default(0),
  /** Nombre d'unités de conditionnement (cartons, casiers…) */
  packagingQty: z.number().min(0).optional(),
  /** Unités détail en vrac (hors conditionnement) */
  detailQty: z.number().min(0).optional(),
  lastUpdated: z.any(),
});

export type StockLevel = z.infer<typeof StockLevelSchema>;

export const StockMovementSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  storeId: z.string(),
  storeName: z.string(),
  type: z.enum(["PURCHASE", "SALE", "TRANSFER_IN", "TRANSFER_OUT", "RETURN", "CORRECTION"]),
  delta: z.number(),
  previousStock: z.number(),
  newStock: z.number(),
  reason: z.string().optional(),
  performedBy: z.string(),
  performedByName: z.string(),
  timestamp: z.any(),
  relatedDocId: z.string().optional(),
});

export type StockMovement = z.infer<typeof StockMovementSchema>;

export const ClientSchema = z.object({
  id: z.string(),
  name: z.string().min(2, "Le nom est requis"),
  phone: z.string().min(8, "Téléphone requis"),
  address: z.string().optional(),
  type: z.enum(["particulier", "grossiste"]),
  status: z.enum(["actif", "suspendu", "vip"]),
  creditCeiling: z.number().default(0),
  currentDebt: z.number().default(0),
  storeOfOriginId: z.string(),
  createdAt: z.any().optional(),
});

export type Client = z.infer<typeof ClientSchema>;

export const PaymentMethodSchema = z.enum([
  "CASH",
  "ORANGE_MONEY",
  "MOBILE_MONEY",
  "CARD",
  "TRANSFER",
  "OTHER",
])

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>

export const ClientPaymentSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  amount: z.number(),
  method: PaymentMethodSchema,
  timestamp: z.any(),
  storeId: z.string(),
  performedBy: z.string(),
  notes: z.string().optional(),
});

export type ClientPayment = z.infer<typeof ClientPaymentSchema>;

export const SupplierSchema = z.object({
  id: z.string(),
  name: z.string().min(2, "Le nom est requis"),
  country: z.string().min(2, "Le pays est requis"),
  city: z.string().optional(),
  type: z.enum(["local", "import"]),
  defaultCurrency: z.enum(CURRENCY_CODES),
  paymentTerms: z.string().optional(),
  currentDebt: z.number().default(0),
  createdAt: z.any().optional(),
});

export type Supplier = z.infer<typeof SupplierSchema>;

export const SupplierPaymentSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  amount: z.number(),
  method: PaymentMethodSchema,
  timestamp: z.any(),
  storeId: z.string(),
  performedBy: z.string(),
  notes: z.string().optional(),
});

export type SupplierPayment = z.infer<typeof SupplierPaymentSchema>;

export interface ExchangeRate {
  code: CurrencyCode;
  rateToRef: number;
  lastUpdated: FirestoreDate | null;
  updatedBy: string;
}

export const PurchaseItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  quantity: z.number().min(0.01),
  unitCost: z.number().min(0),
  currency: z.enum(CURRENCY_CODES),
  exchangeRate: z.number().min(0.0001),
  landedCostFCFA: z.number().optional(),
});

export type PurchaseItem = z.infer<typeof PurchaseItemSchema>;

export const PurchaseExpenseSchema = z.object({
  label: z.string(),
  amount: z.number().min(0),
  currency: z.enum(CURRENCY_CODES),
  exchangeRate: z.number().min(0.0001),
});

export type PurchaseExpense = z.infer<typeof PurchaseExpenseSchema>;

export const PurchaseSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  storeId: z.string(),
  storeName: z.string(),
  timestamp: z.any(),
  items: z.array(PurchaseItemSchema),
  expenses: z.array(PurchaseExpenseSchema),
  subtotalFCFA: z.number(),
  expensesTotalFCFA: z.number(),
  totalFCFA: z.number(),
  status: z.enum(["DRAFT", "ORDERED", "RECEIVED", "CANCELLED"]),
  notes: z.string().optional(),
  performedBy: z.string(),
  performedByName: z.string(),
});

export type Purchase = z.infer<typeof PurchaseSchema>;

export type PriceTier = "retail" | "wholesale";

export const SaleItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
  priceTier: z.enum(["retail", "wholesale"]).default("retail"),
  /** Unité de la quantité vendue (Pièce, Carton…) */
  saleUnit: z.string().optional(),
  /** Quantité en unités détail déduites du stock */
  retailQuantity: z.number().optional(),
});

export type SaleItem = z.infer<typeof SaleItemSchema>;

export const SaleSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  sellerId: z.string(),
  sellerName: z.string(),
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  /** Snapshot téléphone au moment de la vente */
  clientPhone: z.string().optional(),
  /** Snapshot type client au moment de la vente */
  clientType: z.enum(["particulier", "grossiste"]).optional(),
  timestamp: z.any(),
  items: z.array(SaleItemSchema),
  subtotal: z.number(),
  discount: z.number().default(0),
  total: z.number(),
  payments: z.array(z.object({
    method: z.string(),
    amount: z.number(),
  })),
  amountPaid: z.number(),
  debtAmount: z.number(),
  status: z.enum(["COMPLETED", "CANCELLED", "REFUNDED"]),
  cancelledAt: z.any().optional(),
  cancelledBy: z.string().optional(),
  cancelledByName: z.string().optional(),
  cancelReason: z.string().optional(),
  /** Vente de remplacement après correction */
  replacedBySaleId: z.string().optional(),
  /** Vente d'origine remplacée par celle-ci */
  replacesSaleId: z.string().optional(),
});

export type Sale = z.infer<typeof SaleSchema>;

export const ExpenseSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  category: z.string(),
  label: z.string(),
  amount: z.number(),
  method: z.string(),
  timestamp: z.any(),
  performedBy: z.string(),
  performedByName: z.string(),
  notes: z.string().optional(),
  receiptUrl: z.string().optional(),
});

export type Expense = z.infer<typeof ExpenseSchema>;

export const CashSessionSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  status: z.enum(["OPEN", "CLOSED"]),
  openedAt: z.any(),
  openedBy: z.string(),
  openedByName: z.string(),
  closedAt: z.any().optional(),
  closedBy: z.string().optional(),
  initialBalances: z.record(z.string(), z.number()),
  expectedBalances: z.record(z.string(), z.number()),
  actualBalances: z.record(z.string(), z.number()).optional(),
  variances: z.record(z.string(), z.number()).optional(),
  notes: z.string().optional(),
});

export type CashSession = z.infer<typeof CashSessionSchema>;

export const CashMovementSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  sessionId: z.string(),
  type: z.enum(["IN", "OUT"]),
  source: z.enum(["SALE", "EXPENSE", "PURCHASE_PAYMENT", "CLIENT_PAYMENT", "ADJUSTMENT", "FUND_ENTRY", "FUND_WITHDRAWAL"]),
  amount: z.number(),
  method: z.string(),
  timestamp: z.any(),
  performedBy: z.string(),
  performedByName: z.string(),
  relatedDocId: z.string().optional(),
  description: z.string().optional(),
});

export type CashMovement = z.infer<typeof CashMovementSchema>;

export type AppNotificationType = "STOCK_ALERT" | "SALE" | "PURCHASE" | "INFO" | "EXPIRATION_ALERT";

export interface AppNotification {
  id: string;
  type: AppNotificationType;
  title: string;
  message: string;
  timestamp: FirestoreDate;
  read: boolean;
  storeId?: string;
  userId?: string;
  relatedProductId?: string;
  relatedExpirationDate?: string;
}

export type AuditAction =
  | "CREATE_USER"
  | "UPDATE_USER"
  | "ACTIVATE_USER"
  | "SUSPEND_USER"
  | "UPDATE_EXCHANGE_RATE"
  | (string & {});

export type AuditCategory = "user" | "currency" | "system";

export interface AuditLog {
  id: string;
  action: AuditAction;
  details: string;
  targetId?: string;
  performedBy: string;
  performedByName?: string;
  timestamp: FirestoreDate;
}
