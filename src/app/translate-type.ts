import { Injector } from "@angular/core";

export type TranslationTemplateFn = (values: any[]) => string;

export type TranslationValue = string | TranslationTemplateFn;

export type TranslationData = {
  [key: string]: TranslationValue;
};

export type TranslationLoadEvent = string | null;

export type TranslationLoadResponse = {
  lang: string;
  data: TranslationData;
};

export type I18nConfig = {
  injector?: Injector;
  assetsUrl: string;
  defaultLanguage?: string;
  fallbackLanguage?: string;
  languageSupported: string[];
};
