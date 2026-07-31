import type { TableColumnDef } from "@/lib/table-columns"

export const CLIENT_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "client", label: "Client", locked: true },
  { id: "contact", label: "Contact", defaultVisible: false },
  { id: "type", label: "Type", defaultVisible: true },
  { id: "debt", label: "Dette actuelle", defaultVisible: true },
  { id: "status", label: "Statut", defaultVisible: false },
  { id: "actions", label: "Encaissement", locked: true },
]

export const SUPPLIER_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "supplier", label: "Fournisseur", locked: true },
  { id: "location", label: "Localisation", defaultVisible: false },
  { id: "type", label: "Type", defaultVisible: true },
  { id: "currency", label: "Devise", defaultVisible: false },
  { id: "debt", label: "Dette (encours)", defaultVisible: true },
  { id: "actions", label: "Règlement", locked: true },
]

export const INVENTORY_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "product", label: "Produit", locked: true },
  { id: "sku", label: "SKU / Code-barres", defaultVisible: true },
  { id: "category", label: "Catégorie", defaultVisible: false },
  { id: "price", label: "Prix", defaultVisible: true },
  { id: "expiration", label: "Expiration", defaultVisible: true },
  { id: "stock", label: "Stock", defaultVisible: true },
  { id: "actions", label: "Actions", locked: true },
]

export const EXPENSE_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "date", label: "Date & heure", defaultVisible: true },
  { id: "category", label: "Catégorie / Motif", locked: true },
  { id: "method", label: "Mode", defaultVisible: true },
  { id: "author", label: "Auteur", defaultVisible: false },
  { id: "amount", label: "Montant", defaultVisible: true },
]

export const PURCHASE_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "ref", label: "Référence / Date", locked: true },
  { id: "supplier", label: "Fournisseur", defaultVisible: true },
  { id: "items", label: "Articles", defaultVisible: true },
  { id: "total", label: "Total", defaultVisible: true },
  { id: "status", label: "Statut", defaultVisible: true },
  { id: "actions", label: "Actions", locked: true },
]

export const USER_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "user", label: "Collaborateur", locked: true },
  { id: "role", label: "Rôle", defaultVisible: true },
  { id: "stores", label: "Boutiques", defaultVisible: false },
  { id: "status", label: "Statut", defaultVisible: true },
  { id: "actions", label: "Actions", locked: true },
]

export const STORE_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "store", label: "Boutique", locked: true },
  { id: "contact", label: "Contact", defaultVisible: false },
  { id: "created", label: "Création", defaultVisible: false },
  { id: "status", label: "Statut", defaultVisible: true },
  { id: "actions", label: "Actions", locked: true },
]

export const STOCK_HISTORY_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "date", label: "Date & heure", defaultVisible: true },
  { id: "product", label: "Produit", locked: true },
  { id: "type", label: "Type", defaultVisible: true },
  { id: "variation", label: "Variation", defaultVisible: true },
  { id: "finalStock", label: "Stock final", defaultVisible: true },
  { id: "author", label: "Auteur / Motif", defaultVisible: false },
]

export const SALES_REPORT_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "date", label: "Date & Ref", locked: true },
  { id: "client", label: "Client / Vendeur", defaultVisible: true },
  { id: "store", label: "Boutique", defaultVisible: true },
  { id: "total", label: "Total", defaultVisible: true },
  { id: "payment", label: "Encaissement", defaultVisible: false },
  { id: "status", label: "Statut", defaultVisible: true },
  { id: "actions", label: "Actions", defaultVisible: true },
]

export const AUDIT_TABLE_COLUMNS: TableColumnDef[] = [
  { id: "date", label: "Date", defaultVisible: true },
  { id: "action", label: "Action", locked: true },
  { id: "user", label: "Utilisateur", defaultVisible: true },
  { id: "details", label: "Détails", defaultVisible: false },
  { id: "target", label: "Cible", defaultVisible: false },
]
