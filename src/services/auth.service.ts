
import { 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  sendPasswordResetEmail,
  onAuthStateChanged,
  onIdTokenChanged,
  User,
  updatePassword as firebaseUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { mapAuthErrorCode, type AuthErrorContext } from "@/lib/auth-utils";

function getAuthErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Service gérant les interactions directes avec Firebase Authentication
 * et la synchronisation du cookie de session serveur.
 */
/** Évite un double POST (login + onIdTokenChanged) avec le même token. */
let lastSyncedIdToken: string | null = null

export const AuthService = {
  /**
   * Pose le cookie httpOnly via POST /api/auth/session.
   */
  async createServerSession(idToken: string): Promise<void> {
    if (lastSyncedIdToken === idToken) return

    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message || "Impossible de créer la session serveur.");
    }
    lastSyncedIdToken = idToken
    // Pas de GET de confirmation juste après : sur Safari/iOS le cookie Set-Cookie
    // n'est pas toujours lisible dans la requête suivante immédiate (faux échec login).
  },

  /**
   * Efface le cookie de session (idempotent).
   */
  async clearServerSession(): Promise<void> {
    lastSyncedIdToken = null
    try {
      await fetch("/api/auth/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
    } catch {
      // best-effort : la déconnexion client doit continuer
    }
  },

  /**
   * Connecte un utilisateur avec email et mot de passe, puis synchronise le cookie.
   */
  async login(email: string, pass: string) {
    if (!auth) throw new Error("Firebase Auth n'est pas configuré.");
    try {
      const credential = await signInWithEmailAndPassword(auth, email, pass);
      try {
        const idToken = await credential.user.getIdToken();
        await this.createServerSession(idToken);
      } catch {
        await firebaseSignOut(auth);
        throw new Error("Impossible de créer la session serveur.");
      }
      return credential;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message === "Impossible de créer la session serveur."
      ) {
        throw error;
      }
      throw this.handleAuthError(error, "login");
    }
  },

  /**
   * Déconnecte l'utilisateur et efface le cookie serveur.
   */
  async logout() {
    await this.clearServerSession();
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
    } catch {
      throw new Error("Erreur lors de la déconnexion.");
    }
  },

  /**
   * Envoie un email de réinitialisation de mot de passe.
   */
  async resetPassword(email: string) {
    if (!auth) throw new Error("Firebase Auth n'est pas configuré.");
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: unknown) {
      throw this.handleAuthError(error, "reset");
    }
  },

  /**
   * Modifie le mot de passe de l'utilisateur connecté.
   * Nécessite une ré-authentification préalable.
   */
  async changePassword(currentPass: string, newPass: string) {
    if (!auth?.currentUser) throw new Error("Utilisateur non identifié.");
    const user = auth.currentUser;
    
    try {
      const credential = EmailAuthProvider.credential(user.email!, currentPass);
      await reauthenticateWithCredential(user, credential);
      await firebaseUpdatePassword(user, newPass);
    } catch (error: unknown) {
      throw this.handleAuthError(error, "changePassword");
    }
  },

  /**
   * Observe les changements d'état d'authentification (sign-in / sign-out).
   */
  subscribeToAuthChanges(callback: (user: User | null) => void) {
    if (!auth) return () => {};
    return onAuthStateChanged(auth, callback);
  },

  /**
   * Observe les changements / rafraîchissements de l'ID token (refresh ~1h).
   */
  subscribeToIdToken(callback: (user: User | null) => void) {
    if (!auth) return () => {};
    return onIdTokenChanged(auth, callback);
  },

  /**
   * Traduit les codes d'erreur Firebase en messages compréhensibles.
   */
  handleAuthError(error: unknown, context: AuthErrorContext = "login"): Error {
    return new Error(mapAuthErrorCode(getAuthErrorCode(error), context));
  }
};
