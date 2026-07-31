
import { Role } from "@/lib/types";

/**
 * Liste exhaustive des permissions de l'application.
 * Suit la convention : "action:ressource" ou "action:ressource:scope"
 */
export type Permission = 
  | 'manage:stores'           // Créer/supprimer des boutiques (Admin)
  | 'manage:users'            // Gérer les comptes collaborateurs (Admin uniquement)
  | 'manage:currencies'       // Gérer les taux de change (Admin uniquement)
  | 'manage:catalog'          // Gérer le catalogue produits global (Admin/Gérant)
  | 'view:stock'              // Consulter les stocks (Tous)
  | 'view:clients'            // Consulter la base client pour le POS (Tous)
  | 'view:suppliers'          // Consulter les fournisseurs (Admin/Gérant)
  | 'adjust:stock'            // Ajustement manuel d'inventaire (Admin/Gérant)
  | 'manage:transfers'        // Initier/valider des transferts entre boutiques (Admin/Gérant)
  | 'create:sale'             // Enregistrer une vente (Tous)
  | 'cancel:sale'             // Annuler une vente (Tous - CDC 2.2)
  | 'modify:sale'             // Corriger une vente (Tous - CDC 2.2)
  | 'apply:discount:full'     // Remise illimitée (Admin)
  | 'apply:discount:limited'  // Remise sous seuil (Manager/Vendeur)
  | 'manage:purchases'        // Achats fournisseurs et coût de revient (Admin/Gérant)
  | 'manage:expenses'         // Enregistrer des dépenses boutique (Tous)
  | 'reconcile:cash'          // Clôture et rapprochement de caisse (Tous)
  | 'view:reports:global'     // Bilan consolidé (Admin uniquement - CDC 12.3)
  | 'view:reports:store'      // Journal des ventes (Tous - CDC 12.3)
  | 'view:reports:cash'       // Rapport caisse (Admin/Gérant uniquement - CDC 12.3)
  | 'view:reports:clients'    // Créances clients (Admin/Gérant uniquement - CDC 12.3)
  | 'view:reports:suppliers'  // Dettes fournisseurs / Journal achats (Admin/Gérant uniquement - CDC 12.3)
  | 'access:admin:panel';     // Accès aux réglages système (Admin)

/**
 * Matrice de permissions par rôle alignée sur le CDC v1.0.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'manage:stores',
    'manage:users',
    'manage:currencies',
    'manage:catalog',
    'view:stock',
    'view:clients',
    'view:suppliers',
    'adjust:stock',
    'manage:transfers',
    'create:sale',
    'cancel:sale',
    'modify:sale',
    'apply:discount:full',
    'manage:purchases',
    'manage:expenses',
    'reconcile:cash',
    'view:reports:global',
    'view:reports:store',
    'view:reports:cash',
    'view:reports:clients',
    'view:reports:suppliers',
    'access:admin:panel'
  ],
  manager: [
    'manage:catalog',
    'view:stock',
    'view:clients',
    'view:suppliers',
    'adjust:stock',
    'manage:transfers',
    'create:sale',
    'cancel:sale',
    'modify:sale',
    'apply:discount:limited',
    'manage:purchases',
    'manage:expenses',
    'reconcile:cash',
    'view:reports:store',
    'view:reports:cash',
    'view:reports:clients',
    'view:reports:suppliers'
  ],
  seller: [
    'view:stock',
    'view:clients',
    'create:sale',
    'cancel:sale',
    'modify:sale',
    'apply:discount:limited',
    'manage:expenses',
    'reconcile:cash',
    'view:reports:store'
  ]
};

/**
 * Vérifie si un rôle possède une permission spécifique.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Vérifie si un rôle possède au moins une des permissions demandées.
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}
