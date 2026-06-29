// ────────────────────────────────────────────────────────────────────────────
// TronGrid client — read-only chain access for the deposit poller.
//
// Uses the FREE TronGrid REST API (https://api.trongrid.io). An optional
// TRON-PRO-API-KEY (env TRONGRID_API_KEY) raises rate limits but is not
// required. We only READ: list incoming TRC20 transfers, current block, and a
// transaction's block/result for confirmation counting. No keys ever sign here.
// ────────────────────────────────────────────────────────────────────────────

const BASE = process.env.TRONGRID_BASE_URL || "https://api.trongrid.io";

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.TRONGRID_API_KEY;
  if (key) h["TRON-PRO-API-KEY"] = key;
  return h;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`TronGrid ${res.status}`);
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TronGrid ${res.status}`);
  return (await res.json()) as T;
}

export interface Trc20Transfer {
  txid: string;
  from: string;
  to: string;
  value: string; // integer token amount (×10^decimals), as string
  tokenAddress: string;
  decimals: number;
  symbol: string;
  blockTs: number; // ms
}

/** Current block number on the chain (for confirmation counting). */
export async function getNowBlock(): Promise<number> {
  const data = await getJson<{ block_header?: { raw_data?: { number?: number } } }>(
    "/wallet/getnowblock"
  );
  return data.block_header?.raw_data?.number ?? 0;
}

/**
 * Incoming TRC20 transfers TO the business wallet for a given token contract.
 * Filtered server-side by TronGrid (`only_to`, `contract_address`); we re-verify
 * everything in the poller regardless.
 */
export async function getIncomingTransfers(
  wallet: string,
  contract: string,
  limit = 50
): Promise<Trc20Transfer[]> {
  const qs = new URLSearchParams({
    only_to: "true",
    contract_address: contract,
    limit: String(limit),
    order_by: "block_timestamp,desc",
  });
  const data = await getJson<{
    data?: Array<{
      transaction_id: string;
      from: string;
      to: string;
      value: string;
      block_timestamp: number;
      token_info?: { address: string; decimals: number; symbol: string };
    }>;
  }>(`/v1/accounts/${wallet}/transactions/trc20?${qs.toString()}`);

  return (data.data ?? []).map((t) => ({
    txid: t.transaction_id,
    from: t.from,
    to: t.to,
    value: t.value,
    tokenAddress: t.token_info?.address ?? "",
    decimals: t.token_info?.decimals ?? 6,
    symbol: t.token_info?.symbol ?? "",
    blockTs: t.block_timestamp ?? 0,
  }));
}

/** A transaction's block number and whether it executed successfully. */
export async function getTxInfo(
  txid: string
): Promise<{ blockNumber: number; success: boolean } | null> {
  const data = await postJson<{
    blockNumber?: number;
    receipt?: { result?: string };
    contractResult?: string[];
  }>("/wallet/gettransactioninfobyid", { value: txid });
  if (!data || data.blockNumber == null) return null;
  // A TRC20 transfer is successful when the receipt result is SUCCESS (or empty
  // for simple transfers that don't set it). Reverts have result REVERT/etc.
  const result = data.receipt?.result;
  const success = !result || result === "SUCCESS";
  return { blockNumber: data.blockNumber, success };
}
