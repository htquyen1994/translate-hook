import { I18nTranslate } from "./translate-base";
import { I18nTranslateImplement } from "./translate-implement";
import { I18nConfig } from "./translate-type";

// Singleton state - simple module-level variables
let translateInstance: I18nTranslate | null = null;
let isInitialized = false;

/**
 * Initialize I18n với default implementation
 */
export function initializeI18n(config: I18nConfig): I18nTranslateImplement {
  return initializeI18nWithCustom(I18nTranslateImplement, config);
}

/**
 * Initialize I18n với custom implementation
 */
export function initializeI18nWithCustom<T extends I18nTranslate>(
  ImplementationClass: new (config: I18nConfig) => T,
  config: I18nConfig
): T {
  if (isInitialized) {
    console.warn('[I18n] Already initialized');
    // Type-safe check
    if (translateInstance instanceof ImplementationClass) {
      return translateInstance as T;
    }
    throw new Error('[I18n] Cannot reinitialize with different implementation type');
  }

  const instance = new ImplementationClass(config);
  translateInstance = instance;
  isInitialized = true;
  return instance;
}

/**
 * Get I18n singleton instance
 */
export function useI18nTranslate(): I18nTranslate;
export function useI18nTranslate<T extends I18nTranslate>(): T;
export function useI18nTranslate<T extends I18nTranslate = I18nTranslate>(): T {
  if (!isInitialized || !translateInstance) {
    throw new Error('[I18n] Must call initializeI18n() first');
  }
  return translateInstance as T;
}

/**
 * Check if I18n is initialized
 */
export function isI18nInitialized(): boolean {
  return isInitialized;
}

/**
 * Reset I18n state (for testing)
 */
export function resetI18n(): void {
  translateInstance = null;
  isInitialized = false;
}

/**
 * Utility object với common operations
 */
export const I18nUtils = {
  /**
   * Get translate instance với type safety
   */
  get: <T extends I18nTranslate = I18nTranslateImplement>() => useI18nTranslate<T>(),
  
  /**
   * Check if initialized
   */
  isInitialized: () => isI18nInitialized(),
  
  /**
   * Reset for testing
   */
  reset: () => resetI18n(),
  
  /**
   * Safe get - returns null if not initialized
   */
  safeGet: <T extends I18nTranslate = I18nTranslateImplement>(): T | null => {
    try {
      return useI18nTranslate<T>();
    } catch {
      return null;
    }
  }
} as const;
