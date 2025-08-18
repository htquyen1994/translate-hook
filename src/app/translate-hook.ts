// === Translation Cache Functions ===
const createTranslationCache = () => {
  const signalCache = new Map<string, Signal<string>>();
  const observableCache = new Map<string, Observable<string>>();

  const getCacheKey = (key: string, values: any[]): string => {
    return values.length > 0
      ? `${key}:${JSON.stringify(values)}`
      : key;
  };

  const getCachedSignal = (
    key: string,
    values: any[],
    translateFn: Signal<(key: string, values: any[]) => string>
  ): Signal<string> => {
    const cacheKey = getCacheKey(key, values);

    if (!signalCache.has(cacheKey)) {
      const signal = computed(() => translateFn()(key, values));
      signalCache.set(cacheKey, signal);
    }

    return signalCache.get(cacheKey)!;
  };

  const getCachedObservable = (
    key: string,
    values: any[],
    translateFn: Signal<(key: string, values: any[]) => string>,
    destroy$: Subject<void>
  ): Observable<string> => {
    const cacheKey = getCacheKey(key, values);

    if (!observableCache.has(cacheKey)) {
      const signal = getCachedSignal(key, values, translateFn);
      const observable = toObservable(signal).pipe(
        distinctUntilChanged(),
        takeUntil(destroy$),
        shareReplay(1)
      );

      observableCache.set(cacheKey, observable);
    }

    return observableCache.get(cacheKey)!;
  };

  const invalidateCache = () => {
    signalCache.clear();
    observableCache.clear();
  };

  const invalidateKey = (key: string) => {
    const keysToDelete = Array.from(signalCache.keys())
      .filter(cacheKey => cacheKey.startsWith(key));

    keysToDelete.forEach(cacheKey => {
      signalCache.delete(cacheKey);
      observableCache.delete(cacheKey);
    });
  };

  return {
    getCachedSignal,
    getCachedObservable,
    invalidateCache,
    invalidateKey,
    getCacheStats: () => ({
      signalCacheSize: signalCache.size,
      observableCacheSize: observableCache.size
    })
  };
};

// === LRU Cache Implementation ===
const createLRUCache = (maxSize = 1000) => {
  const cache = new Map<string, { signal: Signal<string>; lastUsed: number }>();

  const getCacheKey = (key: string, values: any[]): string => {
    return values.length > 0
      ? `${key}:${JSON.stringify(values)}`
      : key;
  };

  const evictOldest = () => {
    let oldestKey = '';
    let oldestTime = Infinity;

    for (const [key, { lastUsed }] of cache) {
      if (lastUsed < oldestTime) {
        oldestTime = lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
    }
  };

  const getCachedSignal = (
    key: string,
    values: any[],
    translateFn: Signal<(key: string, values: any[]) => string>
  ): Signal<string> => {
    const cacheKey = getCacheKey(key, values);
    const now = Date.now();

    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      cached.lastUsed = now;
      return cached.signal;
    }

    // Evict if needed
    if (cache.size >= maxSize) {
      evictOldest();
    }

    const signal = computed(() => translateFn()(key, values));
    cache.set(cacheKey, { signal, lastUsed: now });

    return signal;
  };

  const clearCache = () => cache.clear();

  return {
    getCachedSignal,
    clearCache,
    getCacheSize: () => cache.size
  };
};

// === Core Translation Functions ===
const createTranslationResolver = () => {
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

  const createTranslateFn = (
    currentLanguage: Signal<string>,
    fallbackLanguage: Signal<string>,
    storeLanguage: Signal<Map<string, TranslationData>>
  ) => {
    return computed(() => {
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
  };

  return { resolveTranslation, createTranslateFn };
};

// === HTTP Request Cache Functions ===
const createRequestCache = (httpClient: HttpClient) => {
  const translationRequestCache = new Map<string, Observable<TranslationLoadResponse>>();

  const getOrCreateRequest = (lang: string, assetUrl: string): Observable<TranslationLoadResponse> => {
    if (!translationRequestCache.has(lang)) {
      const url = `${assetUrl}/${lang}.json`;

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

  const clearRequestCache = () => translationRequestCache.clear();

  return {
    getOrCreateRequest,
    clearRequestCache
  };
};

// === State Management Functions ===
const createStateManagement = () => {
  const setLoadingState = (
    loadingStates: WritableSignal<Map<string, boolean>>,
    lang: string,
    loading: boolean
  ) => {
    const currentStates = loadingStates();
    const newStates = new Map(currentStates);
    newStates.set(lang, loading);
    loadingStates.set(newStates);
  };

  const updateTranslations = (
    storeLanguage: WritableSignal<Map<string, TranslationData>>,
    response: TranslationLoadResponse,
    onTranslationUpdate: () => void
  ) => {
    const { lang, data } = response;
    const currentTranslations = storeLanguage();
    const existingData = currentTranslations.get(lang);

    if (isDifferentTranslateData(existingData, data) && data) {
      const newTranslations = new Map(currentTranslations);
      newTranslations.set(lang, data);
      storeLanguage.set(newTranslations);
      onTranslationUpdate();
    }
  };

  const triggerCallbacks = (callbacks: Set<OnLoadedLanguageFn>) => {
    callbacks.forEach(fn => {
      try {
        fn();
      } catch (err) {
        console.warn(`[I18n] Callback failed`, err);
      }
    });
  };

  return {
    setLoadingState,
    updateTranslations,
    triggerCallbacks
  };
};

// === Language Loading Functions ===
const createLanguageLoader = (
  storeLanguage: WritableSignal<Map<string, TranslationData>>,
  loadingStates: WritableSignal<Map<string, boolean>>,
  requestCache: ReturnType<typeof createRequestCache>,
  stateManager: ReturnType<typeof createStateManagement>,
  destroy$: Subject<void>,
  onTranslationUpdate: () => void
) => {
  const loadLanguageResource = (lang: string, assetUrl: string) => {
    // Check if already loaded
    if (storeLanguage().has(lang)) return;

    // Check if already loading
    const currentLoadingStates = loadingStates();
    if (currentLoadingStates.get(lang)) return;

    // Set loading state
    stateManager.setLoadingState(loadingStates, lang, true);

    // Get or create request
    const request$ = requestCache.getOrCreateRequest(lang, assetUrl);

    request$.pipe(
      takeUntil(destroy$),
      catchError(error => {
        console.warn(`[I18n] Failed to load translation file: ${lang}`, error);
        return of({ lang, data: {} });
      })
    ).subscribe(result => {
      stateManager.updateTranslations(storeLanguage, result, onTranslationUpdate);
      stateManager.setLoadingState(loadingStates, lang, false);
    });
  };

  return { loadLanguageResource };
};

// === Configuration Functions ===
const createConfigurationManager = (storageService: LocalStorageService) => {
  const initializeConfig = (
    configure: I18nTranslationConfig,
    currentLanguage: WritableSignal<string>,
    supportedLanguages: WritableSignal<string[]>,
    fallbackLanguage: WritableSignal<string>,
    assetResourceUrl: WritableSignal<string>
  ) => {
    const { languageSupported, fallbackLanguage: fallbackLangConf, assetsUrl } = configure;

    // Get saved language or default
    const savedLang = storageService.getData(CSP_I18N_STORAGE_LANG);
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

  return { initializeConfig };
};

// === Callback Management Functions ===
const createCallbackManager = () => {
  const addCallback = (
    callbacks: WritableSignal<Set<OnLoadedLanguageFn>>,
    fn: OnLoadedLanguageFn
  ): RevokeFn => {
    const currentCallbacks = callbacks();
    const newCallbacks = new Set(currentCallbacks);
    newCallbacks.add(fn);
    callbacks.set(newCallbacks);

    return () => {
      const currentCallbacks = callbacks();
      const updatedCallbacks = new Set(currentCallbacks);
      updatedCallbacks.delete(fn);
      callbacks.set(updatedCallbacks);
    };
  };

  return { addCallback };
};

// === Main Factory Function ===
const initInstanceI18n = (configure: I18nLanguageConfigure): I18nTranslate => {
  const { injector, translationConfig = CSP_LANGUAGE_CONFIG } = configure;

  // Create signals
  const storeLanguage = signal<Map<string, TranslationData>>(new Map());
  const currentLanguage = signal<string>('');
  const supportedLanguages = signal<string[]>([]);
  const loadingStates = signal<Map<string, boolean>>(new Map());
  const languageChangedCallbacks = signal<Set<OnLoadedLanguageFn>>(new Set());
  const fallbackLanguage = signal<string>('');
  const assetResourceUrl = signal<string>('');

  const destroy$ = new Subject<void>();

  // Get dependencies
  const [httpClient, storageLanguage] = runInInjectionContext(injector, () => {
    const httpClient = inject(HttpClient);
    const storageLanguage = inject(LocalStorageService);
    return [httpClient, storageLanguage];
  });

  // Create functional modules
  const translationResolver = createTranslationResolver();
  const translationCache = createTranslationCache();
  const requestCache = createRequestCache(httpClient);
  const stateManager = createStateManagement();
  const configManager = createConfigurationManager(storageLanguage);
  const callbackManager = createCallbackManager();

  // Create translate function
  const translateFn = translationResolver.createTranslateFn(
    currentLanguage,
    fallbackLanguage,
    storeLanguage
  );

  // Callback for translation updates
  const onTranslationUpdate = () => {
    const callbacks = languageChangedCallbacks();
    stateManager.triggerCallbacks(callbacks);
  };

  // Create language loader
  const languageLoader = createLanguageLoader(
    storeLanguage,
    loadingStates,
    requestCache,
    stateManager,
    destroy$,
    onTranslationUpdate
  );

  // Setup reactive effects
  const setupReactiveEffects = () => {
    runInInjectionContext(injector, () => {
      // Auto-save language changes
      effect(() => {
        const lang = currentLanguage();
        if (lang) {
          storageLanguage.storeData(CSP_I18N_STORAGE_LANG, lang);
        }
      });

      // Auto-load language resources
      effect(() => {
        const lang = currentLanguage();
        const assetUrl = assetResourceUrl();
        if (lang && assetUrl) {
          languageLoader.loadLanguageResource(lang, assetUrl);
        }
      });

      // Clear cache when language or translations change
      effect(() => {
        currentLanguage();
        storeLanguage();
        translationCache.invalidateCache();
      });
    });
  };

  // Public API
  const instance: I18nTranslate = {
    supportedLanguages: supportedLanguages as WritableSignal<string[]>,
    currentLanguage: currentLanguage as WritableSignal<string>,

    getSignal: (key: string, ...values: any[]): Signal<string> => {
      return translationCache.getCachedSignal(key, values, translateFn);
    },

    get$: (key: string, ...values: any[]): Observable<string> => {
      return translationCache.getCachedObservable(key, values, translateFn, destroy$);
    },

    get: (key: string, ...values: any[]): string => {
      return translateFn()(key, values);
    },

    setLanguage: (lang: string) => {
      const supported = supportedLanguages();
      if (!supported.includes(lang)) {
        console.warn(`[I18n] Unsupported language: '${lang}'`);
        return;
      }

      if (currentLanguage() === lang) return;
      currentLanguage.set(lang);
    },

    onChangedLanguage: (fn: OnLoadedLanguageFn): RevokeFn => {
      return callbackManager.addCallback(languageChangedCallbacks, fn);
    },

    dispose: () => {
      destroy$.next();
      destroy$.complete();

      requestCache.clearRequestCache();
      translationCache.invalidateCache();
      languageChangedCallbacks().clear();
      storeLanguage().clear();
      loadingStates().clear();

      console.log("[I18n] Reactive store disposed");
    }
  };

  // Initialize
  configManager.initializeConfig(
    translationConfig,
    currentLanguage,
    supportedLanguages,
    fallbackLanguage,
    assetResourceUrl
  );

  setupReactiveEffects();

  // Auto cleanup
  runInInjectionContext(injector, () => {
    inject(DestroyRef).onDestroy(instance.dispose);
  });

  return instance;
};

// === Global Instance Management Functions ===
const createGlobalInstanceManager = () => {
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
      isInitializedFlag = false;
      instanceI18nGlobal = null;
      throw error;
    }
  };

  const getInstanceI18n = (): I18nTranslate => {
    if (!instanceI18nGlobal) {
      throw new Error("[I18n] Must call initializeI18n() first");
    }
    return instanceI18nGlobal;
  };

  return {
    initializeI18n,
    getInstanceI18n
  };
};

// Create global manager
const globalManager = createGlobalInstanceManager();

// Export public API
export const useI18nTranslate = globalManager.getInstanceI18n;
export const useInitializeI18n = globalManager.initializeI18n;
