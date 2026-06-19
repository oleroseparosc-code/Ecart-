import { describe, expect, it } from "vitest";
import { effectiveRoomUpdatedAt, formatRoomUpdatedAt, markRoomsUpdated } from "./roomUpdateDate";

describe("room update dates", () => {
  it("formats local update dates as yy.MM.dd", () => {
    expect(formatRoomUpdatedAt(new Date(2026, 5, 19))).toBe("26.06.19");
  });

  it("uses the source sheet date until a room has been edited", () => {
    const room = { id: "HBEF심혈관조영실", sourceUpdatedAt: "26.03.26" };

    expect(effectiveRoomUpdatedAt(room, {})).toBe("26.03.26");
    expect(effectiveRoomUpdatedAt(room, { HBEF심혈관조영실: "26.06.19" })).toBe("26.06.19");
  });

  it("marks multiple rooms with the same edit date", () => {
    const updated = markRoomsUpdated({}, ["42W", "HBEF심혈관조영실"], new Date(2026, 5, 19));

    expect(updated).toEqual({
      "42W": "26.06.19",
      "HBEF심혈관조영실": "26.06.19",
    });
  });
});
