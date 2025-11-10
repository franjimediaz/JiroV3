import type { DataProvider, AggregateInput } from "../engines/computeEngine";

/**
 * Stub mínimo; reemplázalo internamente por fetch a tu API/DB.
 */
export const dataProvider: DataProvider = {
  async aggregate(input: AggregateInput, record: any, _context?: Record<string, any>) {
    // TODO: sustituir por llamada real:
    // const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/aggregate`, { method:"POST", body: JSON.stringify({ input, record }) });
    // const { value } = await res.json();
    // return Number(value) || 0;

    console.warn("[@repo/ui] aggregate STUB → reemplazar por implementación real", { input, record });
    return 0;
  },
};
