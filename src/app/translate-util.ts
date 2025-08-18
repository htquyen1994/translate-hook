import { TranslationData, TranslationTemplateFn } from "./translate.type";

function taggedTemplate(segments: string[], placeholders: number[], values: any[]): string {
  return segments.reduce((prev, current, index) => {
    const idx = placeholders[index];
    const value = values[idx];
    const interpolated = value !== null && value !== undefined ? String(value) : (idx ? `{{${idx}}}` : '');
    return prev + current + interpolated
  }, '')
}
function compileTemplateFunction(template: string): (values: any[]) => string {
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
  return (values: any[]) => taggedTemplate(segments, placeholders, values);
} export function isDifferentTranslateData(a?: TranslationData, b?: TranslationData): boolean {
  if (!a || !b) return true;
  if (a === b) return false;
  if (Object.keys(a).length !== Object.keys(b).length) return true;
  return false
}

export function tryGetTranslate(key: string, lang: string, values: any[], store: Map<string, TranslationData>) {
  const translations = store.get(lang);
  if (!translations) return null;
  let temp = translations[key];
  if (typeof temp === 'string') {
    const compiled = compileTemplateFunction(temp);
    translations[key] = compiled;
    temp = compiled;
  }
  if (typeof temp === 'function') {
    return (temp as TranslationTemplateFn)(values);
  }
  return key;
}
