import {
  I18nTranslationConfig,
  OnLoadedLanguageFn,
  TranslationData,
  TranslationLoadResponse,
  I18nLanguageConfigure,
  I18nTranslate,
  RevokeFn
} from './translate.type';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  runInInjectionContext,
  Signal,
  signal,
  WritableSignal
} from "@angular/core";
import {
  catchError,
  map,
  Observable,
  of,
  shareReplay,
  Subject,
  takeUntil,
  distinctUntilChanged,
  toObservable
} from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { LocalStorageService } from '@@coreService';
import { isDifferentTranslateData, tryGetTranslate } from './translate-util';

const CSP_I18N_STORAGE_LANG = 'csp-lang';
const CSP_LANGUAGE_CONFIG: I18nTranslationConfig = {
  assetsUrl: './assets/i18n',
  defaultLanguage: 'en',
  fallbackLanguage: 'en',
  languageSupported: ['en', 'vi']
};

const initInstanceI18n = (configure: I18nLanguageConfigure): I18nTranslate => {
  const { injector, translationConfig = CSP_LANGUAGE_CONFIG } = configure;

  // === Reactive State - Single Source of Truth ===
  const storeLanguage = signal<Map<string, TranslationData>>(new Map());
  const currentLanguage = signal<string>('');
  const supportedLanguages = signal<string[]>([]);
  const loadingStates = signal<Map<string, boolean>>(new Map());
  const languageChangedCallbacks = signal<Set<OnLoadedLanguageFn>>(new Set());

  // Configuration signals
  const fallbackLanguage = signal<string>('');
  const assetResourceUrl = signal<string>('');

  // Request cache for HTTP calls
  const translationRequestCache = new Map<string, Observable<TranslationLoadResponse>>();
  const destroy$ = new Subject<void>();

  // Dependencies injection
  const [httpClient, storageLanguage] = runInInjectionContext(injector, () => {
    const httpClient = inject(HttpClient);
    const storageLanguage = inject(LocalStorageService);
    return [httpClient, storageLanguage];
  });

  // === Core Translation Logic - Single Computed ===

  /**
   * Single source of truth cho tất cả translation resolution
   * Mọi method khác đều derived từ computed này
   */
  const translateFn = computed(() => {
    const currentLang = currentLanguage();
    const fallbackLang = fallbackLanguage();
    const translations = storeLanguage();

    return (key: string, values: any[] = []): string => {
      // Try current language first
      let result = resolveTranslation(key, currentLang, values, translations);

      // Fallback to fallback language if needed
      if (result === key && fallbackLang && fallbackLang !== currentLang) {
        result = resolveTranslation(key, fallbackLang, values, translations);
      }

      return result;
    };
  });

  // === Helper Functions ===

  const resolveTranslation = (
    key: string,
    lang: string,
    values: any[],
    translations: Map<string, TranslationData>
  ): string => {
    const langData = translations.get(lang);
    if (!langData) return key;

    return tryGetTranslate(key, lang, values, translations) ?? key;
  };

  const setLoadingState = (lang: string, loading: boolean) => {
    const currentStates = loadingStates();
    const newStates = new Map(currentStates);
    newStates.set(lang, loading);
    loadingStates.set(newStates);
  };

  const triggerLanguageChangedCallbacks = () => {
    const callbacks = languageChangedCallbacks();
    callbacks.forEach(fn => {
      try {
        fn();
      } catch (err) {
        console.warn(`[I18n] Callback failed`, err);
      }
    });
  };

  const handleTranslationResponse = (response: TranslationLoadResponse) => {
    const { lang, data } = response;
    const currentTranslations = storeLanguage();
    const existingData = currentTranslations.get(lang);

    if (isDifferentTranslateData(existingData, data) && data) {
      // Update translations immutably
      const newTranslations = new Map(currentTranslations);
      newTranslations.set(lang, data);
      storeLanguage.set(newTranslations);
      triggerLanguageChangedCallbacks();
    }
  };

  const getOrCreateTranslationRequest = (lang: string): Observable<TranslationLoadResponse> => {
    if (!translationRequestCache.has(lang)) {
      const url = `${assetResourceUrl()}/${lang}.json`;

      const request$ = httpClient.get<TranslationData>(url).pipe(
        map(data => ({ lang, data })),
        shareReplay(1),
        catchError(error => {
          console.warn(`[I18n] Failed to load translation file: ${url}`, error);
          return of({ lang, data: {} });
        })
      );

      translationRequestCache.set(lang, request$);
    }

    return translationRequestCache.get(lang)!;
  };

  const loadLanguageResource = (lang: string) => {
    // Check if already loaded
    if (storeLanguage().has(lang)) return;

    // Check if already loading
    const currentLoadingStates = loadingStates();
    if (currentLoadingStates.get(lang)) return;

    // Set loading state
    setLoadingState(lang, true);

    // Get or create request
    const request$ = getOrCreateTranslationRequest(lang);

    request$.pipe(
      takeUntil(destroy$),
      catchError(error => {
        console.warn(`[I18n] Failed to load translation file: ${lang}`, error);
        return of({ lang, data: {} });
      })
    ).subscribe(result => {
      handleTranslationResponse(result);
      setLoadingState(lang, false);
    });
  };

  const initializeConfig = (configure: I18nTranslationConfig) => {
    const { languageSupported, fallbackLanguage: fallbackLangConf, assetsUrl } = configure;

    // Get saved language or default
    const savedLang = storageLanguage.getData(CSP_I18N_STORAGE_LANG);
    const defaultLanguage = savedLang || configure.defaultLanguage || 'en';

    // Setup supported languages
    const supportedLangs = languageSupported?.length ? languageSupported : [defaultLanguage];
    const finalDefaultLang = supportedLangs.includes(defaultLanguage)
      ? defaultLanguage
      : supportedLangs[0];

    // Set configuration
    fallbackLanguage.set(fallbackLangConf ?? finalDefaultLang);
    assetResourceUrl.set(assetsUrl);
    supportedLanguages.set([...supportedLangs]);
    currentLanguage.set(finalDefaultLang);
  };

  const setupReactiveEffects = () => {
    runInInjectionContext(injector, () => {
      // Auto-save language changes to storage
      effect(() => {
        const lang = currentLanguage();
        if (lang) {
          storageLanguage.storeData(CSP_I18N_STORAGE_LANG, lang);
        }
      });

      // Auto-load language resources when language changes
      effect(() => {
        const lang = currentLanguage();
        if (lang) {
          loadLanguageResource(lang);
        }
      });
    });
  };

  // === Public API ===

  const instance: I18nTranslate = {
    supportedLanguages: supportedLanguages as WritableSignal<string[]>,
    currentLanguage: currentLanguage as WritableSignal<string>,

    /**
     * Get translation as Signal - Zero memory leaks!
     * Mỗi call tạo lightweight computed derived từ translateFn
     */
    getSignal: (key: string, ...values: any[]): Signal<string> => {
      return computed(() => translateFn()(key, values));
    },

    /**
     * Get translation as Observable
     * Derived từ signal nên cũng zero memory leaks
     */
    get$: (key: string, ...values: any[]): Observable<string> => {
      const signal = computed(() => translateFn()(key, values));
      return toObservable(signal).pipe(
        distinctUntilChanged(),
        takeUntil(destroy$)
      );
    },

    /**
     * Get translation synchronously
     * Direct call to translateFn
     */
    get: (key: string, ...values: any[]): string => {
      return translateFn()(key, values);
    },

    /**
     * Set current language with validation
     */
    setLanguage: (lang: string) => {
      const supported = supportedLanguages();
      if (!supported.includes(lang)) {
        console.warn(`[I18n] Unsupported language: '${lang}'`);
        return;
      }

      if (currentLanguage() === lang) return;
      currentLanguage.set(lang);
    },

    /**
     * Subscribe to language changes
     */
    onChangedLanguage: (fn: OnLoadedLanguageFn): RevokeFn => {
      const callbacks = languageChangedCallbacks();
      const newCallbacks = new Set(callbacks);
      newCallbacks.add(fn);
      languageChangedCallbacks.set(newCallbacks);

      return () => {
        const currentCallbacks = languageChangedCallbacks();
        const updatedCallbacks = new Set(currentCallbacks);
        updatedCallbacks.delete(fn);
        languageChangedCallbacks.set(updatedCallbacks);
      };
    },

    /**
     * Cleanup all resources
     */
    dispose: () => {
      destroy$.next();
      destroy$.complete();

      // Clear all caches and state
      translationRequestCache.clear();
      languageChangedCallbacks().clear();
      storeLanguage().clear();
      loadingStates().clear();

      console.log("[I18n] Reactive store disposed");
    }
  };

  // === Initialization ===

  // Initialize configuration
  initializeConfig(translationConfig);

  // Setup reactive effects
  setupReactiveEffects();

  // Auto cleanup when injector is destroyed
  runInInjectionContext(injector, () => {
    inject(DestroyRef).onDestroy(instance.dispose);
  });

  return instance;
};

// === Global Instance Management ===

let instanceI18nGlobal: I18nTranslate | null = null;
let isInitializedFlag = false;

const initializeI18n = (configure: I18nLanguageConfigure): I18nTranslate => {
  if (!configure?.injector) {
    throw new Error("[I18n] Missing Angular injector in configuration");
  }

  if (isInitializedFlag) {
    console.warn("[I18n] Already initialized, returning existing instance");
    return instanceI18nGlobal!;
  }

  try {
    isInitializedFlag = true;
    instanceI18nGlobal = initInstanceI18n(configure);
    return instanceI18nGlobal;
  } catch (error) {
    // Reset state on error
    isInitializedFlag = false;
    instanceI18nGlobal = null;
    throw error;
  }
};

function getInstanceI18n(): I18nTranslate {
  if (!instanceI18nGlobal) {
    throw new Error("[I18n] Must call initializeI18n() first");
  }
  return instanceI18nGlobal;
}

export const useI18nTranslate = getInstanceI18n;
export const useInitializeI18n = initializeI18n;
