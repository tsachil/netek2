import { describe, it, expect } from "vitest";
import { parseAndValidate, parseValidateAndExtract } from "../src/bcpValidator";

const validCsv = `חן קלע,חן אופק,שם חשבון,חסימות קודי פעולה,יתרת עו"ש נוכחית,יתרת עו"ש מעוכבת,יתרת חשבונות נספחים עו"ש מט"ח,הלוואות,פקדונות,תוכניות חסכון,ניירות ערך,ערבויות,עיקולים,שיעבודים, מחזור חובה שנתי,סך קווי אשראי,חיוב ויזה קרוב,חוב ויזה,סמנים
123456,123456789012,דניאל לוי,,12543.78,0,250.00,0,50000,12000,34500,0,0,0,180000,75000,2300,4500,T1
`;

describe("bcp validator", () => {
  it("accepts valid file and returns summary", () => {
    const result = parseAndValidate(validCsv, "BCP_REPORT_SNIF0726.csv");
    expect("summary" in result).toBe(true);
    if ("summary" in result) {
      expect(result.summary.rows).toBe(1);
      expect(result.summary.branchCode).toBe("0726");
      expect(result.summary.totalCurrentBalance).toBeCloseTo(12543.78);
    }
  });

  it("rejects invalid filename", () => {
    const result = parseAndValidate(validCsv, "BAD_FILE.csv");
    expect("errors" in result).toBe(true);
  });

  it("rejects missing current balance", () => {
    const csv = `חן קלע,חן אופק,שם חשבון,חסימות קודי פעולה,יתרת עו"ש נוכחית,יתרת עו"ש מעוכבת,יתרת חשבונות נספחים עו"ש מט"ח,הלוואות,פקדונות,תוכניות חסכון,ניירות ערך,ערבויות,עיקולים,שיעבודים, מחזור חובה שנתי,סך קווי אשראי,חיוב ויזה קרוב,חוב ויזה,סמנים
123456,123456789012,דניאל לוי,,,0,250.00,0,50000,12000,34500,0,0,0,180000,75000,2300,4500,T1
`;
    const result = parseAndValidate(csv, "BCP_REPORT_SNIF0726.csv");
    expect("errors" in result).toBe(true);
  });

  it("rejects short row", () => {
    const csv = `a,b,c\n1,2,3\n`;
    const result = parseAndValidate(csv, "BCP_REPORT_SNIF0726.csv");
    expect("errors" in result).toBe(true);
  });

  it("extracts parsed rows for persistence path", () => {
    const result = parseValidateAndExtract(validCsv, "BCP_REPORT_SNIF0726.csv");
    expect("summary" in result).toBe(true);
    if ("summary" in result) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].accountKey).toBe("123456");
      expect(result.rows[0].currentBalance).toBeCloseTo(12543.78);
      expect(result.rows[0].heldBalance).toBe(0);
    }
  });
});
