import { describe, expect, it } from "vitest";
import { findRecognizedDrug, preparationNotes, selectDefaultDrug, type LocatorDrug } from "./PharmacyDrugLocator";

const drugs: LocatorDrug[] = [
  { code: "XMMR2", itemCode: "8806555002726", name: "MMR II 0.5ml inj", koreanName: "엠엠알", strength: ".5 ml", drugType: "백신", storage: "냉장" },
  { code: "XRAMOSET", itemCode: "8806809002427", name: "Nasea 0.3mg/2ml inj", koreanName: "나제아주사액", strength: ".3 mg", drugType: "앰플", storage: "실온", ampouleHolder: "Y" },
];

describe("PharmacyDrugLocator", () => {
  it("shows preparation notes below cautions for MMR and injectable Nasea", () => {
    expect(preparationNotes(drugs[0])).toEqual(["용해액 필요"]);
    expect(preparationNotes(drugs[1])).toEqual(["니들 필요", "앰플꽂이 필요"]);
  });

  it("matches recognized label trade-name text to a registered drug", () => {
    expect(findRecognizedDrug(drugs, "MMR II 0.5ml inj")?.code).toBe("XMMR2");
    expect(findRecognizedDrug(drugs, "Nasea 0.3mg/2ml inj")?.code).toBe("XRAMOSET");
    expect(findRecognizedDrug([...drugs, { code: "XMEXO", itemCode: "", name: "MACperan 10mg/2ml inj", koreanName: "", strength: "", drugType: "", storage: "" }], "Macperan 10mg/2ml inj")?.code).toBe("XMEXO");
    expect(findRecognizedDrug([...drugs, { code: "EDOXA1", itemCode: "", name: "Lixiana 15mg tab", koreanName: "", strength: "", drugType: "", storage: "" }], "Lixiana")?.code).toBe("EDOXA1");
  });

  it("shows the exact row selected from a multi-result search", () => {
    const tablet: LocatorDrug = { code: "RAMOSET", itemCode: "", name: "Nasea 0.1mg OD tab", koreanName: "나제아", strength: ".1 mg", drugType: "PTP", storage: "실온" };
    expect(selectDefaultDrug([tablet, drugs[1]], " xramOset ")?.code).toBe("XRAMOSET");
  });
});
