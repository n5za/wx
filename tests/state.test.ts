import { describe, expect, it } from "vitest";
import { paintsKey, playerKey, starsKey } from "../src/solver/state";

describe("state keys", () => {
  it("produces stable player keys", () => {
    expect(playerKey(3, 4, "N")).toBe("3,4|N");
    expect(playerKey(3, 4, "N")).toBe(playerKey(3, 4, "N"));
  });

  it("sorts star keys for a canonical string", () => {
    const set = new Set(["3,0", "1,0", "2,0"]);
    expect(starsKey(set)).toBe("1,0,2,0,3,0");
    expect(starsKey(new Set<string>())).toBe(".");
  });

  it("sorts paint keys for a canonical string", () => {
    const paints = new Map<string, "red" | "green" | "blue">([
      ["2,2", "red"],
      ["1,1", "green"],
    ]);
    expect(paintsKey(paints)).toBe("1,1:green,2,2:red");
    expect(paintsKey(new Map())).toBe(".");
  });
});
