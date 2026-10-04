/**
 * Локализация строк, которые выводит модуль. Чистая логика без Foundry: переводчик подставляется
 * снаружи — в Foundry это game.i18n (src/foundry/index.ts), в тестах — lang/ru.json
 * (tests/setup/i18n.ts). Текст, введённый пользователем, через t() не проходит.
 *
 * Ключи — `RELGRAPH.<Область>.<Имя>`, файлы — lang/ru.json и lang/en.json.
 * Вызывать t() только при показе, не на верхнем уровне модуля: переводы Foundry загружаются
 * после хука init (хук i18nInit).
 */

export type I18nData = Record<string, string | number>;
export type Translator = (key: string, data?: I18nData) => string;

/** Без переводчика — сам ключ (так же ведёт себя game.i18n для неизвестного ключа). */
let translator: Translator = (key) => key;
let pluralRules = new Intl.PluralRules("ru");

/** lang — код языка для согласования чисел (game.i18n.lang). */
export function setTranslator(fn: Translator, lang: string): void {
  translator = fn;
  pluralRules = new Intl.PluralRules(lang);
}

export function t(key: string, data?: I18nData): string {
  return translator(key, data);
}

/**
 * Строка с числом: ключ — группа форм по категориям Intl.PluralRules
 * (`one`, `few`, `many`, `other`; для английского достаточно `one` и `other`),
 * в каждой форме плейсхолдер {count}. Нет нужной категории — берётся `other`.
 */
export function tn(key: string, count: number, data?: I18nData): string {
  const forms = { ...data, count };
  const exact = `${key}.${pluralRules.select(count)}`;
  const text = t(exact, forms);
  return text === exact ? t(`${key}.other`, forms) : text;
}
