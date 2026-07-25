
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { 
  initializeFirestore, 
  getFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  type Firestore 
} from "firebase/firestore";
import { firebaseConfig } from "./config";

// Vérifier si la configuration est valide (apiKey présente) pour éviter le crash immédiat
const isConfigValid = !!(firebaseConfig.apiKey && firebaseConfig.apiKey !== "");

// Initialisation sécurisée
const app = isConfigValid 
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)) 
  : null;

// On exporte les instances ou null si la config est invalide
// Note: Les services devront vérifier la présence de ces instances avant utilisation
const auth: Auth | null = app ? getAuth(app) : null;

let dbInstance: Firestore = null as unknown as Firestore;
if (app) {
  if (getApps().length > 1) {
    dbInstance = getFirestore(app);
  } else {
    try {
      dbInstance = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      dbInstance = getFirestore(app);
    }
  }
}

const db: Firestore = dbInstance;

export { app, auth, db };

