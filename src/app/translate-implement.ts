import { catchError, firstValueFrom, map, Observable, of, shareReplay, combineLatest, switchMap, startWith } from "rxjs";
import { I18nConfig, TranslationLoadResponse, TranslationData, TranslationLoadEvent, TranslationTemplateFn } from "./translate.type";
import { effect, resource, Signal, signal, computed, toSignal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { I18nTranslate } from "./translate-base";
import { LocalStorageService } from "@@coreService";

const DEFAULT_I18N_CONFIG = {
  assetsUrl: './assets/i18n',
  defaultLanguage: 'vi',
  fallbackLanguage: 'en',
  languageSupported: ['vi', 'en']
};

export class I18nTranslateImplement extends I18nTranslate {
  #httpClient!: HttpClient;
  #storage!: LocalStorageService;
  #storeLanguage = new Map<string, TranslationData>();
  #languagesSupported: string[] = [];
  #fallbackLanguage!: string;
  #config!: I18nConfig;
  #currentLanguage = signal<string>('');
  #eventLanguageLoaded = signal<TranslationLoadEvent>(null);
  #translationRequests: Record<string, Observable<TranslationLoadResponse>> = {};

  #translateLoadResource = resource({
    request: () => ({ lang: this.#currentLanguage() }),
    loader: ({ request }) => {
      if (!request || !request?.lang) {
        return Promise.reject(new Error('Invalid language request'));
      }
      const { lang } = request;
      this.#translationRequests[lang] ??= this.#loadTranslateAssetResources(lang);
      return firstValueFrom(this.#translationRequests[lang]);
    },
  });

  #translateLoadResourceEffect = effect(() => {
    const result = this.#translateLoadResource.value();
    if (!result) return;
    const { lang, data } = result;
    const prevTranslate = this.#storeLanguage.get(lang);
    if (this.#isDifferentTranslateData(prevTranslate, data)) {
      this.#storeLanguage.set(lang, data);
      this.#eventLanguageLoaded.set(lang);
    }
  });

  override eventLanguageLoadedSignal: Signal<TranslationLoadEvent> = this.#eventLanguageLoaded.asReadonly();
  override currentLanguageSignal: Signal<string> = this.#currentLanguage.asReadonly();

  constructor(override i18nConfig: I18nConfig) {
    super(i18nConfig);
    this.#httpClient = this.injector.get(HttpClient);
    this.#storage = this.injector.get(LocalStorageService);
    this.#initializeConfig(i18nConfig);
  }

  #initializeConfig(i18nConfig: I18nConfig) {
    const mergedConfig = { ...DEFAULT_I18N_CONFIG, ...i18nConfig };
    const defaultLanguage = this.#getCurrentLangFromStore() || mergedConfig.defaultLanguage!;
    const supportedLangs = mergedConfig.languageSupported?.length
      ? mergedConfig.languageSupported
      : [defaultLanguage];
    const finalDefaultLang = supportedLangs.includes(defaultLanguage)
      ? defaultLanguage
      : supportedLangs[0];
    this.#fallbackLanguage = mergedConfig.fallbackLanguage ?? finalDefaultLang;
    this.#currentLanguage.set(finalDefaultLang);
    this.setLanguageSupport(supportedLangs);
    this.#config = mergedConfig;
  }

  override setLanguage(lang: string) {
    if (!this.#languagesSupported.includes(lang)) {
      console.warn(`Unsupported language: '${lang}'.`);
      return;
    }
    if (this.#currentLanguage() !== lang) {
      this.#currentLanguage.set(lang);
      this.#setCurrentLangToStore(lang);
    }
  }

  override setLanguageSupport(langs: string[]): void {
    if (!langs?.length) {
      console.warn('No supported languages provided');
      return;
    }
    this.#languagesSupported = [...langs];
  }

  override getLanguageSupport(): string[] {
    return [...this.#languagesSupported];
  }

  override getCurrentLang(): string {
    return this.#currentLanguage();
  }

  public get(key: string, ...values: any[]): string {
    return this.#getTranslationText(key, this.#currentLanguage(), values);
  }

  override get$(key: string, ...values: any[]): Observable<string> {
    // Create observable from current language signal
    const currentLang$ = new Observable<string>(subscriber => {
      const unsubscribe = effect(() => {
        subscriber.next(this.#currentLanguage());
      });
      return () => unsubscribe.destroy();
    });

    return currentLang$.pipe(
      switchMap(currentLang => {
        // Check if translation is already loaded
        const existingTranslation = this.#getTranslateData(currentLang);
        if (existingTranslation) {
          // Translation already loaded, return immediately
          return of(this.#getTranslationText(key, currentLang, values));
        }

        // Check if loading is pending
        if (this.#translateLoadResource.isLoading()) {
          // Wait for loading to complete, then return translation
          const languageLoaded$ = new Observable<TranslationLoadEvent>(subscriber => {
            const unsubscribe = effect(() => {
              const loadedLang = this.#eventLanguageLoaded();
              if (loadedLang === currentLang) {
                subscriber.next(loadedLang);
                subscriber.complete();
              }
            });
            return () => unsubscribe.destroy();
          });

          return languageLoaded$.pipe(
            map(() => this.#getTranslationText(key, currentLang, values))
          );
        }

        // No translation and not loading, return key as fallback
        return of(this.#getTranslationText(key, currentLang, values));
      })
    );
  }

  override getSignal(key: string, ...values: any[]): Signal<string> {
    // Convert Observable to Signal
    return toSignal(this.get$(key, ...values), { 
      initialValue: this.#getTranslationText(key, this.#currentLanguage(), values) 
    });
  }

  #getTranslationText(key: string, currentLang: string, values: any[]): string {
    let translates = this.#tryGetTranslate(key, currentLang, values);
    if (!translates && this.#fallbackLanguage && this.#fallbackLanguage !== currentLang) {
      translates = this.#tryGetTranslate(key, this.#fallbackLanguage, values);
    }
    return translates ?? key;
  }

  #tryGetTranslate(key: string, lang: string, values: any[]) {
    const translations = this.#getTranslateData(lang);
    if (!translations) return null;
    let temp = translations[key];
    if (typeof temp === 'string') {
      const compiled = this.#compileTemplateFunction(temp);
      translations[key] = compiled;
      temp = compiled;
    }
    if (typeof temp === 'function') {
      return (temp as TranslationTemplateFn)(values);
    }
    return key;
  }

  #loadTranslateAssetResources(lang: string): Observable<TranslationLoadResponse> {
    const url = `${this.#config.assetsUrl}/${lang}.json`;
    return this.#httpClient.get<TranslationData>(url).pipe(
      shareReplay(1),
      map(res => ({ lang, data: res })),
      catchError(error => {
        console.warn(`[I18n] Failed to load translation file: ${url}`, error);
        return of({ lang, data: {} });
      })
    );
  }

  #getTranslateData(lang: string) {
    return this.#storeLanguage.get(lang);
  }

  #setCurrentLangToStore(lang: string) {
    this.#storage.storeData(I18nTranslate.I18N_STORAGE_KEY, lang);
  }

  #getCurrentLangFromStore(): string | null {
    return this.#storage.getData(I18nTranslate.I18N_STORAGE_KEY, { parse: false });
  }

  #compileTemplateFunction(template: string): (values: any[]) => string {
    const segments: string[] = [];
    const placeholders: number[] = [];
    let lastIndex = 0;
    template.replace(/\{\{(\d+)\}\}/g, (match, paramIndex, offset) => {
      segments.push(template.slice(lastIndex, offset));
      placeholders.push(paramIndex);
      lastIndex = offset + match.length;
      return match;
    });
    segments.push(template.slice(lastIndex));
    return (values: any[]) => this.#taggedTemplate(segments, placeholders, values);
  }

  #taggedTemplate(segments: string[], placeholders: number[], values: any[]): string {
    return segments.reduce((prev, current, index) => {
      const idx = placeholders[index];
      const value = values[idx];
      const interpolated = value !== null && value !== undefined
        ? String(value)
        : (idx ? `{{${idx}}}` : '');
      return prev + current + interpolated;
    }, '');
  }

  #isDifferentTranslateData(a?: TranslationData, b?: TranslationData): boolean {
    if (!a || !b) return true;
    if (a === b) return false;
    if (Object.keys(a).length !== Object.keys(b).length) return true;
    return false;
  }

  destroy(): void {
    this.#storeLanguage.clear();
    this.#translationRequests = {};
  }
}
