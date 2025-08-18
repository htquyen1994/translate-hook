import { Injector, Signal, WritableSignal } from "@angular/core";
import { Observable } from "rxjs";
export type RevokeFn = () => void
export type TranslationTemplateFn = (values: any[]) => string;

export type TranslationValue = string | TranslationTemplateFn;

export type TranslationData = {
  [key: string]: TranslationValue;
}

export type TranslationLoadEvent = string | null;

export type TranslationLoadResponse = {
  lang: string;
  data: TranslationData;
};

export type I18nTranslationConfig = {
  assetsUrl: string;
  defaultLanguage?: string;
  fallbackLanguage?: string;
  languageSupported: string[];
}

export type I18nConfig = {
  injector: Injector;
  translationConfig?: I18nTranslationConfig;
}

export type OnLoadedLanguageFn = () => void;

export type I18nLanguageConfigure = {
  injector: Injector;
  translationConfig?: I18nTranslationConfig;
}

export type I18nTranslate = {
  supportedLanguages: WritableSignal<string[]>;
  currentLanguage: WritableSignal<string>;
  setLanguage: (lang: string) => void;
  get: (key: string, ...values: any[]) => string;
  get$: (key: string, ...values: any[]) => Observable<string>;
  getSignal: (key: string, ...values: any[]) => Signal<string>;
  dispose: () => void;
  onChangedLanguage: (fn: OnLoadedLanguageFn) => RevokeFn;
}
