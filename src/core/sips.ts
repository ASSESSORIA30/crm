export interface SipsEntry { cups: string; returned_cups: string | null; annual_kwh: number | null; tariff: string | null; address: string | null; status: "found" | "not_found" | "error"; consulted_at: string; error?: string | null }
export function normalizedCups(raw: string | null | undefined): string {
 return (raw ?? "").toUpperCase().replace(/[\s.\-]/g, "").replace(/[^A-Z0-9]/g, "").replace(/^(.{20})[A-Z0-9]{2}$/, "$1");
}
export function isElectricCups(raw: string | null | undefined): boolean { return /^ES[0-9]{16}[A-Z]{2}$/.test(normalizedCups(raw)); }
