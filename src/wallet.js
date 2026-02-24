// src/wallet.js – Phantom / Solflare wallet connect + $PUNCH token balance
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO UPDATE WHEN $PUNCH IS LIVE:
//   Replace PUNCH_MINT below with the real SPL token mint address.
// ─────────────────────────────────────────────────────────────────────────────

const PUNCH_MINT = 'NV2RYH954cTJ3ckFUpvfqaQXU4ARqqDH3562nFSpump';

// Tiers based on $PUNCH held
export const TIERS = [
    {
        name: 'WHALE', min: 1_000_000, color: '#F7931A',
        shield: true, bullBonus: 5, comboStart: true,
        magnetBonus: true, // doubles magnet radius
        perks: ['🪖 Start with Shield', '🧲 2× Magnet Radius', '⚡ Start with Combo', '+5s Bull Market'],
    },
    {
        name: 'HOLDER', min: 500_000, color: '#9945FF',
        shield: false, bullBonus: 3, comboStart: false,
        magnetBonus: false,
        perks: ['+3s Bull Market', '🔮 Priority Queue'],
    },
    {
        name: 'DEGEN', min: 100_000, color: '#22c55e',
        shield: true, bullBonus: 10, comboStart: false,
        magnetBonus: false,
        perks: ['🪖 Start with Shield', '+10s Bull Market'],
    },
    {
        name: null, min: 0, color: '#888',
        shield: false, bullBonus: 0, comboStart: false,
        magnetBonus: false,
        perks: [],
    },
];

// Solana public mainnet RPC
const SOL_RPC = 'https://api.mainnet-beta.solana.com';

// ── WalletManager ─────────────────────────────────────────────────────────────
export class WalletManager {
    constructor() {
        this._pubkey = null;
        this._balance = 0;
        this._tier = TIERS[TIERS.length - 1];
        this._checking = false;
        this._error = null;
        if (typeof window !== 'undefined') window._wallet = this;
    }

    isConnected() { return this._pubkey !== null; }
    getPubkey() { return this._pubkey; }
    getBalance() { return this._balance; }
    getTier() { return this._tier; }

    hasWallet() { return !!(this._phantom() || this._solflare()); }

    getShortAddress() {
        if (!this._pubkey) return '';
        return `${this._pubkey.slice(0, 4)}...${this._pubkey.slice(-4)}`;
    }

    async connect() {
        const provider = this._phantom() || this._solflare();
        if (!provider) {
            this._error = 'No wallet found. Install Phantom or Solflare.';
            return false;
        }
        try {
            const resp = await provider.connect();
            this._pubkey = resp.publicKey.toString();
            this._error = null;
            this._checkBalance();
            return true;
        } catch (e) {
            this._error = 'Connection rejected.';
            return false;
        }
    }

    disconnect() {
        const provider = this._phantom() || this._solflare();
        provider?.disconnect?.();
        this._pubkey = null;
        this._balance = 0;
        this._tier = TIERS[TIERS.length - 1];
    }

    _phantom() { return window.phantom?.solana ?? window.solana; }
    _solflare() { return window.solflare?.isSolflare ? window.solflare : null; }

    async _checkBalance() {
        if (!this._pubkey || PUNCH_MINT === 'PUNCH_MINT_ADDRESS_HERE') {
            this._tier = TIERS[TIERS.length - 1];
            return;
        }
        this._checking = true;
        try {
            const body = {
                jsonrpc: '2.0', id: 1,
                method: 'getTokenAccountsByOwner',
                params: [
                    this._pubkey,
                    { mint: PUNCH_MINT },
                    { encoding: 'jsonParsed' },
                ],
            };
            const res = await fetch(SOL_RPC, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            const accs = data?.result?.value ?? [];
            let total = 0;
            for (const acc of accs) {
                const amount = acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
                total += amount;
            }
            this._balance = total;
            this._tier = TIERS.find(t => total >= t.min) ?? TIERS[TIERS.length - 1];
        } catch {
            // RPC error — keep existing tier
        } finally {
            this._checking = false;
        }
    }
}
