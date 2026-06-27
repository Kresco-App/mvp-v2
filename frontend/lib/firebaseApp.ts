import { getApps, initializeApp, type FirebaseApp } from '@firebase/app'
import type { FirebasePublicAuthConfig } from './firebaseConfig'

const FIREBASE_APP_NAME = 'kresco-web'

export function getFirebaseApp(config: FirebasePublicAuthConfig): FirebaseApp {
  return getApps().find((app) => app.name === FIREBASE_APP_NAME) ?? initializeApp(config, FIREBASE_APP_NAME)
}
