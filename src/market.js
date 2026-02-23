// src/market.js – Real-time SOL price watcher using CoinGecko free API
// Polls every 60 seconds, exposes getMode() → 'bull' | 'bear' | 'neutral'

const POLL_MS = 60_000;
const BULL_THRESHOLD = 3;  // % 24h change for bull mode
const BEAR_THRESHOLD = -3; // % 24h change for bear mode

const CG_URL = 'https://api.coingecko.com/api/v3/simple/price' +
    '?ids=solana&vs_currencies=usd&include_24hr_change=true';

export class MarketWatcher {
    constructor() {
        this._price = null;   // USD
        this._change24 = null;   // % (positive = up)
        this._mode = 'neutral';
        this._error = false;
        this._fetch();
        this._timer = setInterval(() => this._fetch(), POLL_MS);
        // expose on window for debugging
        if (typeof window !== 'undefined') window._market = this;
    }

    /** 'bull' | 'bear' | 'neutral' */
    getMode() { return this._mode; }
    /** SOL price in USD or null */
    getPrice() { return this._price; }
    /** 24h % change or null */
    getChange() { return this._change24; }
    /** True if last fetch failed */
    hasError() { return this._error; }

    async _fetch() {
        try {
            const res = await fetch(CG_URL, { cache: 'no-store' });
            if (!res.ok) throw new Error('non-200');
            const data = await res.json();
            this._price = data?.solana?.usd ?? null;
            this._change24 = data?.solana?.usd_24h_change ?? null;
            this._error = false;

            if (this._change24 >= BULL_THRESHOLD) this._mode = 'bull';
            else if (this._change24 <= BEAR_THRESHOLD) this._mode = 'bear';
            else this._mode = 'neutral';
        } catch {
            this._error = true;
            // keep previous mode on failure
        }
    }

    /** Format display string e.g. "SOL $142.30 ▲4.2%" */
    getDisplayString() {
        if (this._price === null) return '';
        const arrow = this._change24 > 0 ? '▲' : this._change24 < 0 ? '▼' : '—';
        const pct = this._change24 !== null ? `${arrow}${Math.abs(this._change24).toFixed(1)}%` : '';
        return `SOL $${this._price.toFixed(2)} ${pct}`;
    }

    /** Color based on mode */
    getColor() {
        return this._mode === 'bull' ? '#22c55e'
            : this._mode === 'bear' ? '#ef4444'
                : '#aaaaaa';
    }

    destroy() { clearInterval(this._timer); }
}
