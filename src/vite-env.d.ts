/// <reference types="vite/client" />

import type { FitbitBridge, HealthAssistantBridge } from './types'

declare global {
  interface Window {
    fitbit?: FitbitBridge
    healthAssistant?: HealthAssistantBridge
  }
}

export {}
