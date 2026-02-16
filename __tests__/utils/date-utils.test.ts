import { describe, it, expect } from "vitest";

import { generateDatestamp } from "../../src/utils/date-utils.js";

describe("generateDatestamp - date formatting", () => {
    it("should generate correct datestamp format", () => {
        const date = new Date("2024-03-15T10:30:00.000Z");
        const result = generateDatestamp(date);

        // Format: YYYY-M-D_H-M (local time)
        expect(result).toMatch(/^\d{4}-\d{1,2}-\d{1,2}_\d{1,2}-\d{1,2}$/);
    });

    it("should handle single digit months and days", () => {
        const date = new Date("2024-01-05T08:05:00.000Z");
        const result = generateDatestamp(date);

        // Should not pad with zeros based on implementation
        expect(result).toMatch(/^\d{4}-\d{1,2}-\d{1,2}_\d{1,2}-\d{1,2}$/);
    });

    it("should use local time (not UTC)", () => {
        const date = new Date("2024-06-15T12:30:00.000Z");
        const result = generateDatestamp(date);

        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours();
        const minutes = date.getMinutes();

        expect(result).toBe(`${year}-${month}-${day}_${hours}-${minutes}`);
    });

    it("should handle midnight correctly", () => {
        const date = new Date("2024-01-01T00:00:00.000Z");
        const result = generateDatestamp(date);

        expect(result).toMatch(/^\d{4}-\d{1,2}-\d{1,2}_\d{1,2}-\d{1,2}$/);
    });

    it("should handle end of year", () => {
        const date = new Date("2024-12-31T23:59:00.000Z");
        const result = generateDatestamp(date);

        expect(result).toMatch(/^\d{4}-\d{1,2}-\d{1,2}_\d{1,2}-\d{1,2}$/);
    });
});
