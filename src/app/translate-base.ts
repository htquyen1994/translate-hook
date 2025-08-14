import { Injector, Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { I18nConfig, TranslationLoadEvent } from './translate-type';

export abstract class I18nTranslate {
  static I18N_STORAGE_KEY = 'csp-lang';
  static LanguageLabelRecord: Record<string, string> = {
    'en': 'EN',
    'vi': 'VI',
  };

  #injector!: Injector;

  constructor(public i18nConfig: I18nConfig) {
    if (!i18nConfig?.injector) {
      throw new Error("Injector not provider");
    }
    this.#injector = i18nConfig?.injector;
  }

  get injector() {
    return this.#injector;
  }

  abstract setLanguage(lang: string): void;
  abstract setLanguageSupport(langs: string[]): void;
  abstract getLanguageSupport(): string[];
  abstract getCurrentLang(): string;
  
  // Synchronous get
  abstract get(key: string, ...values: any[]): string;
  
  // Observable get - reactive to language changes
  abstract get$(key: string, ...values: any[]): Observable<string>;
  
  // Signal get - reactive to language changes  
  abstract getSignal(key: string, ...values: any[]): Signal<string>;
  
  abstract currentLanguageSignal: Signal<string>;
  abstract eventLanguageLoadedSignal: Signal<TranslationLoadEvent>;
}
