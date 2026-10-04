import { describe, expect, it } from "vitest";
import { setTranslator, t, tn } from "../../src/core/i18n";

const dict: Record<string, string> = {
  "X.Hello": "Привет, {name}",
  "X.Nodes.one": "{count} узел",
  "X.Nodes.few": "{count} узла",
  "X.Nodes.many": "{count} узлов",
  "Y.Nodes.one": "{count} node",
  "Y.Nodes.other": "{count} nodes",
};

function use(lang: string): void {
  setTranslator((key, data) => {
    const text = dict[key];
    if (text === undefined) return key;
    return data ? text.replace(/\{(\w+)\}/g, (_, n: string) => String(data[n])) : text;
  }, lang);
}

describe("t", () => {
  it("подставляет данные и возвращает ключ, если перевода нет", () => {
    use("ru");
    expect(t("X.Hello", { name: "Анна" })).toBe("Привет, Анна");
    expect(t("X.Missing")).toBe("X.Missing");
  });
});

describe("tn", () => {
  it.each([
    [1, "1 узел"],
    [3, "3 узла"],
    [5, "5 узлов"],
    [11, "11 узлов"],
    [21, "21 узел"],
  ])("ru: %i", (count, expected) => {
    use("ru");
    expect(tn("X.Nodes", count)).toBe(expected);
  });

  it.each([
    [1, "1 node"],
    [2, "2 nodes"],
    [0, "0 nodes"],
  ])("en: %i", (count, expected) => {
    use("en");
    expect(tn("Y.Nodes", count)).toBe(expected);
  });

  it("нет нужной категории — берётся other", () => {
    use("ru");
    expect(tn("Y.Nodes", 5)).toBe("5 nodes");
  });
});
