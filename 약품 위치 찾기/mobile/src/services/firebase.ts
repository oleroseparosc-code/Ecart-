import { FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, Timestamp } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export type DrugType = 'ORAL' | 'INJECTION';
export type DrugCategory =
  | 'PTP'
  | 'ATC'
  | '산제'
  | '시럽'
  | 'Ampule'
  | 'Vial'
  | '영양수액'
  | '냉장주사';

export interface Drug {
  drug_code: string;
  brand_name: string;
  brand_name_alias: string[];
  generic_name: string;
  drug_type: DrugType;
  drug_category: DrugCategory;
  label_layout: 'BOTTOM' | 'CENTER';
  location_code: string;
  location_display: string;
  shape_image_url: string;
  high_risk_flag: boolean;
  storage_condition: string;
  caution_category: string;
  other_precautions: string;
  last_updated: Timestamp;
}
