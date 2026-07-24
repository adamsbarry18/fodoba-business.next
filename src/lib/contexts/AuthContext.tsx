"use client"

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, type UserCredential } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, limit, writeBatch } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/client";
import { AuthService } from "@/services/auth.service";
import { UserProfile } from "@/lib/types";
import { UserService } from "@/services/user.service";
import { extractFirstNameFromEmail } from "@/lib/user-utils";
import { toast } from "sonner";

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isSeller: boolean;
  login: (email: string, pass: string) => Promise<UserCredential>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const BOOTSTRAP_SETTINGS_ID = "bootstrap";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string, user: User) => {
    if (!db) {
      throw new Error("Base de données non configurée. Vérifiez votre fichier .env");
    }

    const userDocRef = doc(db, "users", uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // Bootstrap : premier compte Auth → profil Admin (prénom dérivé de l'email)
      const usersSnap = await getDocs(query(collection(db, "users"), limit(1)));

      if (usersSnap.empty) {
        const email = user.email || "";
        const firstName = extractFirstNameFromEmail(email);
        const initialProfile: UserProfile = {
          uid,
          email,
          lastName: "",
          firstName,
          role: "admin",
          storeIds: [],
          active: true,
        };
        const batch = writeBatch(db);
        batch.set(userDocRef, initialProfile);
        batch.set(doc(db, "settings", BOOTSTRAP_SETTINGS_ID), {
          completed: true,
          adminUid: uid,
          createdAt: new Date().toISOString(),
        });
        await batch.commit();
        toast.info(`Bienvenue ${firstName} — profil administrateur créé.`);
        return initialProfile;
      }

      throw new Error("Compte non configuré dans Firestore. Contactez l'administrateur.");
    }

    const profile = { uid, ...userDoc.data() } as UserProfile;
    if (!profile.active) {
      throw new Error("Votre compte a été suspendu. Contactez l'administrateur.");
    }
    return profile;
  };

  useEffect(() => {
    if (!auth) {
      console.warn("Firebase Auth n'est pas initialisé. Vérifiez votre configuration.");
      setLoading(false);
      return;
    }

    const unsubscribeAuth = AuthService.subscribeToAuthChanges(async (user) => {
      if (user) {
        try {
          const profile = await fetchProfile(user.uid, user);
          setCurrentUser(user);
          setUserProfile(profile);
        } catch (error: unknown) {
          toast.error(error instanceof Error ? error.message : "Erreur d'authentification");
          await AuthService.logout();
          setCurrentUser(null);
          setUserProfile(null);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    // Rafraîchit le cookie httpOnly à chaque renouvellement de l'ID token (~1h)
    const unsubscribeToken = AuthService.subscribeToIdToken(async (user) => {
      if (!user) return;
      try {
        const idToken = await user.getIdToken();
        await AuthService.createServerSession(idToken);
      } catch (error) {
        console.error("Échec de synchronisation de la session serveur:", error);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeToken();
    };
  }, []);

  const refreshProfile = async () => {
    if (!currentUser) return;
    const profile = await UserService.getUser(currentUser.uid);
    if (profile) setUserProfile(profile);
  };

  const value = {
    currentUser,
    userProfile,
    loading,
    isAdmin: userProfile?.role === "admin",
    isManager: userProfile?.role === "manager",
    isSeller: userProfile?.role === "seller",
    login: AuthService.login.bind(AuthService),
    logout: AuthService.logout.bind(AuthService),
    resetPassword: AuthService.resetPassword.bind(AuthService),
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
