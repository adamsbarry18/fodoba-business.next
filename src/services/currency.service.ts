import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore"
import { db } from "@/lib/firebase/client"
import { ExchangeRate, CurrencyCode, UserProfile } from "@/lib/types"
import { UserService } from "./user.service"
import {
  CURRENCY_ORDER,
  DEFAULT_APP_SETTINGS,
  DEFAULT_RATES,
  STORAGE_CURRENCY,
  displayedRateToStorageRate,
  isValidCurrencyCode,
  validateRate,
  type AppCurrencySettings,
} from "@/lib/currency-utils"

const COLLECTION_NAME = "currencies"
const SETTINGS_COLLECTION = "settings"
const APP_SETTINGS_ID = "app"

export const CurrencyService = {
  async getRates(): Promise<Record<CurrencyCode, number>> {
    const rates = await this.getExchangeRates()
    return rates.reduce(
      (acc, rate) => {
        acc[rate.code] = rate.rateToRef
        return acc
      },
      { ...DEFAULT_RATES } as Record<CurrencyCode, number>
    )
  },

  async getExchangeRates(): Promise<ExchangeRate[]> {
    const snap = await getDocs(collection(db, COLLECTION_NAME))
    const stored = new Map<CurrencyCode, ExchangeRate>()

    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as ExchangeRate
      stored.set(data.code, data)
    })

    return CURRENCY_ORDER.map((code) => {
      if (stored.has(code)) return stored.get(code)!
      return {
        code,
        rateToRef: DEFAULT_RATES[code],
        lastUpdated: null,
        updatedBy: code === STORAGE_CURRENCY ? "Système" : "-",
      }
    })
  },

  async getAppSettings(): Promise<AppCurrencySettings> {
    const snap = await getDoc(doc(db, SETTINGS_COLLECTION, APP_SETTINGS_ID))
    if (!snap.exists()) return { ...DEFAULT_APP_SETTINGS }

    const data = snap.data() as Partial<AppCurrencySettings>
    const code = data.referenceCurrency
    if (!code || !isValidCurrencyCode(code)) {
      return { ...DEFAULT_APP_SETTINGS }
    }

    return {
      referenceCurrency: code,
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy,
    }
  },

  async setReferenceCurrency(code: CurrencyCode, user: UserProfile) {
    if (!isValidCurrencyCode(code)) {
      throw new Error("Devise de référence invalide.")
    }

    const docRef = doc(db, SETTINGS_COLLECTION, APP_SETTINGS_ID)
    await setDoc(
      docRef,
      {
        referenceCurrency: code,
        updatedAt: serverTimestamp(),
        updatedBy: `${user.firstName} ${user.lastName}`,
      },
      { merge: true }
    )

    await UserService.logAudit(
      "UPDATE_REFERENCE_CURRENCY",
      `Devise de référence définie sur ${code} par ${user.firstName}`,
      code
    )
  },

  /**
   * Met à jour un taux à partir de la valeur affichée « 1 code = x reference ».
   * Stockage interne : toujours rateToRef = valeur en FCFA.
   */
  async updateDisplayedRate(
    code: CurrencyCode,
    displayedRateVsReference: number,
    reference: CurrencyCode,
    currentRates: Record<CurrencyCode, number>,
    user: UserProfile
  ) {
    if (code === reference) {
      throw new Error("currencies.error.cannotEditReference")
    }

    const validationError = validateRate(displayedRateVsReference)
    if (validationError) throw new Error(validationError)

    let targetCode: CurrencyCode
    let rateToFcfa: number

    if (code === STORAGE_CURRENCY && reference !== STORAGE_CURRENCY) {
      // 1 FCFA = x REF ⇒ rate(REF→FCFA) = 1/x
      targetCode = reference
      rateToFcfa = 1 / displayedRateVsReference
    } else {
      targetCode = code
      rateToFcfa = displayedRateToStorageRate(
        code,
        displayedRateVsReference,
        reference,
        currentRates
      )
    }

    const storageValidation = validateRate(rateToFcfa)
    if (storageValidation) throw new Error(storageValidation)

    if (targetCode === STORAGE_CURRENCY) {
      throw new Error("currencies.error.storageRateFixed")
    }

    const docRef = doc(db, COLLECTION_NAME, targetCode)
    const data: ExchangeRate = {
      code: targetCode,
      rateToRef: rateToFcfa,
      lastUpdated: serverTimestamp(),
      updatedBy: `${user.firstName} ${user.lastName}`,
    }

    await setDoc(docRef, data, { merge: true })

    await UserService.logAudit(
      "UPDATE_EXCHANGE_RATE",
      `Mise à jour du taux ${targetCode} à ${rateToFcfa} FCFA (saisie ${code}=${displayedRateVsReference} ${reference}) par ${user.firstName}`,
      targetCode
    )
  },

  /** @deprecated Préférer updateDisplayedRate */
  async updateRate(code: CurrencyCode, rate: number, user: UserProfile) {
    await this.updateDisplayedRate(code, rate, STORAGE_CURRENCY, DEFAULT_RATES, user)
  },
}
