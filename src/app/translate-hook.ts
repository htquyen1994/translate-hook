import { I18nTranslate } from "./translate-base";
import { I18nTranslateImplement } from "./translate-implement";
import { I18nConfig } from "./translate-type";

const storeI18nTranslate = new WeakMap<Function, InstanceType<typeof I18nTranslate>>();

function getInstanceI18nTranslate(abstractClass: Function, config?: Partial<I18nConfig>): I18nTranslate {
  let instance = storeI18nTranslate.get(abstractClass);
  if (!instance) {
    const mergeConfig = {
      languageSupported: ['vi', 'en'],
      defaultLanguage: 'vi',
      assetsUrl: './assets/i18n',
      fallbackLanguage: 'en',
      ...config
    };
    instance = new I18nTranslateImplement(mergeConfig);
    storeI18nTranslate.set(abstractClass, instance);
  }
  return instance;
}

export const useI18nTranslate = getInstanceI18nTranslate;
