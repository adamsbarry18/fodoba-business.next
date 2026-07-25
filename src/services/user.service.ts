
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  orderBy, 
  limit, 
  startAfter,
  serverTimestamp,
  DocumentSnapshot,
  addDoc
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase/client";
import { UserProfile } from "@/lib/types";
import { stripUndefined } from "@/lib/firestore-utils";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebase/config";

const COLLECTION_NAME = "users";
const AUDIT_COLLECTION = "audit_logs";

export const UserService = {
  async listUsers(pageSize = 20, lastVisible?: DocumentSnapshot) {
    let q = query(
      collection(db, COLLECTION_NAME),
      orderBy("lastName", "asc"),
      limit(pageSize)
    );

    if (lastVisible) {
      q = query(q, startAfter(lastVisible));
    }

    const snap = await getDocs(q);
    const users = snap.docs.map(doc => doc.data() as UserProfile);
    return {
      users,
      lastVisible: snap.docs[snap.docs.length - 1],
    };
  },

  async getUser(uid: string) {
    const docRef = doc(db, COLLECTION_NAME, uid);
    const snap = await getDoc(docRef);
    return snap.exists() ? (snap.data() as UserProfile) : null;
  },

  /**
   * Crée un collaborateur (Compte Auth + Profil Firestore)
   * Utilise une instance Firebase secondaire pour ne pas déconnecter l'admin actuel.
   */
  async createCollaborator(data: Omit<UserProfile, "uid"> & { password?: string }) {
    const tempAppName = `temp-app-${Date.now()}`;
    const tempApp = initializeApp(firebaseConfig, tempAppName);
    const tempAuth = getAuth(tempApp);

    try {
      const { password, ...profileData } = data;
      
      // 1. Création du compte dans Firebase Auth
      const userCred = await createUserWithEmailAndPassword(
        tempAuth, 
        data.email, 
        password || "Fodoba2026!"
      );
      
      const uid = userCred.user.uid;

      // 2. Création du profil dans Firestore
      const profile = await this.createUserProfile(uid, profileData);

      // 3. Nettoyage
      await deleteApp(tempApp);
      return profile;
    } catch (error) {
      await deleteApp(tempApp);
      throw error;
    }
  },

  async createUserProfile(uid: string, data: Omit<UserProfile, "uid">) {
    const userRef = doc(db, COLLECTION_NAME, uid);
    const profile: UserProfile = {
      ...data,
      uid,
    };
    await setDoc(userRef, stripUndefined(profile));
    await this.logAudit("CREATE_USER", `Création de l'utilisateur ${data.email}`, uid);
    return profile;
  },

  async updateUserProfile(uid: string, data: Partial<UserProfile>) {
    const docRef = doc(db, COLLECTION_NAME, uid);
    const { uid: _ignoredUid, ...rest } = data;
    const payload = stripUndefined(rest);
    await updateDoc(docRef, payload);
    await this.logAudit("UPDATE_USER", `Mise à jour du profil ${uid}`, uid);
  },

  /**
   * Mise à jour limitée du profil par l'utilisateur connecté (prénom, nom, téléphone, photo).
   */
  async updateOwnProfile(
    uid: string,
    data: Pick<UserProfile, "firstName" | "lastName"> & {
      phone?: string;
      photoURL?: string;
    }
  ) {
    if (!auth || auth.currentUser?.uid !== uid) {
      throw new Error("Vous ne pouvez modifier que votre propre profil.");
    }

    const payload: Record<string, string> = {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
    };

    if (data.phone !== undefined) {
      payload.phone = data.phone.trim();
    }
    if (data.photoURL !== undefined) {
      payload.photoURL = data.photoURL;
    }

    const docRef = doc(db, COLLECTION_NAME, uid);
    await updateDoc(docRef, payload);
    await this.logAudit("UPDATE_USER", "Mise à jour du profil personnel", uid);
  },

  async toggleUserStatus(uid: string, active: boolean) {
    await this.updateUserProfile(uid, { active });
    await this.logAudit(active ? "ACTIVATE_USER" : "SUSPEND_USER", `Changement de statut pour ${uid}`, uid);
  },

  async logAudit(action: string, details: string, targetId?: string, performedByNameOverride?: string) {
    const currentUser = auth?.currentUser;
    let performedByName = performedByNameOverride || "Système";

    if (!performedByNameOverride && currentUser?.uid) {
      performedByName = currentUser.displayName || currentUser.email || currentUser.uid;
    }

    await addDoc(collection(db, AUDIT_COLLECTION), stripUndefined({
      action,
      details,
      targetId,
      performedBy: currentUser?.uid || "system",
      performedByName,
      timestamp: serverTimestamp(),
    }));
  }
};
