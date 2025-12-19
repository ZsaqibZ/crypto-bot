const express = require('express');
const ccxt = require('ccxt');
const colors = require('colors');

// --- 1. CONFIGURATION ---
// EXPANDED LIST: 30 Correlated Pairs (Sector-Based)
const PAIRS = [
    // --- THE KINGS (High Correlation, Low Volatility) ---
    ['ETH/USDT', 'BTC/USDT'],
    ['BNB/USDT', 'BTC/USDT'],
    ['LTC/USDT', 'BTC/USDT'],
    ['BCH/USDT', 'BTC/USDT'],
    
    // --- ETHEREUM & FRIENDS (L2s & Competitors) ---
    ['MATIC/USDT', 'ETH/USDT'],
    ['OP/USDT', 'ETH/USDT'],
    ['ARB/USDT', 'ETH/USDT'],
    ['SOL/USDT', 'ETH/USDT'],
    ['AVAX/USDT', 'ETH/USDT'],
    ['DOT/USDT', 'ETH/USDT'],

    // --- LAYER 1 WARS (Highly Cointegrated) ---
    ['AVAX/USDT', 'SOL/USDT'],
    ['NEAR/USDT', 'SOL/USDT'],
    ['ADA/USDT', 'XRP/USDT'],
    ['ATOM/USDT', 'DOT/USDT'],
    ['FTM/USDT', 'MATIC/USDT'],
    ['TRX/USDT', 'XRP/USDT'],
    
    // --- LEGACY COINS (The "Dino" Coins) ---
    ['EOS/USDT', 'XTZ/USDT'],
    ['XLM/USDT', 'XRP/USDT'], // CLASSIC PAIR
    ['LTC/USDT', 'BCH/USDT'],
    ['ETC/USDT', 'ETH/USDT'],

    // --- DEFI BLUE CHIPS ---
    ['UNI/USDT', 'AAVE/USDT'],
    ['LINK/USDT', 'ETH/USDT'], // Oracle vs Chain
    ['MKR/USDT', 'AAVE/USDT'],
    ['CRV/USDT', 'CVX/USDT'],  // Symbiotic Relationship
    ['LDO/USDT', 'ETH/USDT'],  // Staking vs Token

    // --- MEME COINS (High Volatility - The "Fun" Zone) ---
    ['DOGE/USDT', 'SHIB/USDT'],
    ['PEPE/USDT', 'DOGE/USDT'],
    ['FLOKI/USDT', 'SHIB/USDT'],
    ['MEME/USDT', 'PEPE/USDT'],
    
    // --- EXCHANGE TOKENS ---
    ['KCS/USDT', 'BNB/USDT']   // If available on Binance (KuCoin vs Binance)
];

const CONFIG = {
    capitalPerPair: 25.0,  // $25 per pair
    entryZ: 0.5,           // Signal Strength
    exitZ: 0.0,            // Mean Reversion
    stopLossZ: 4         // Structural Break
};

// --- 2. GLOBAL STATE ---
let marketState = {}; // Stores live Z-scores for frontend
let virtualWallet = { balance: 250.00, locked: 0.00 };
let activePositions = {}; 

// --- 3. WEB DASHBOARD (The Frontend) ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    // Sort: Active trades first, then by highest Z-Score (Red/Green)
    const sortedPairs = Object.keys(marketState).sort((a, b) => {
        if (activePositions[a] && !activePositions[b]) return -1;
        if (!activePositions[a] && activePositions[b]) return 1;
        return Math.abs(marketState[b].z) - Math.abs(marketState[a].z);
    });

    let tableRows = sortedPairs.map(pair => {
        const data = marketState[pair];
        const z = data.z;
        const inTrade = activePositions[pair];
        
        // Color Logic
        let zColor = 'black';
        if (z > 1.5) zColor = '#d9534f'; // Red (Sell Signal)
        if (z < -1.5) zColor = '#5cb85c'; // Green (Buy Signal)
        
        // Row Highlight
        let rowStyle = inTrade ? 'background-color: #fff3cd;' : '';

        return `
            <tr style="${rowStyle}">
                <td><strong>${pair}</strong></td>
                <td style="color:${zColor}; font-weight:bold; font-size: 1.1em;">${z.toFixed(4)}</td>
                <td>${data.beta.toFixed(4)}</td>
                <td>$${data.px.toFixed(4)} / $${data.py.toFixed(4)}</td>
                <td>${inTrade ? '⚡ ACTIVE' : 'WAITING'}</td>
            </tr>
        `;
    }).join('');

    const html = `
        <html>
        <head>
            <meta http-equiv="refresh" content="1"> <title>Algo Dashboard</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #f8f9fa; padding: 20px; }
                .container { max-width: 1000px; margin: 0 auto; }
                .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
                .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
                .card h3 { margin: 0; color: #666; font-size: 0.9em; }
                .card div { font-size: 1.5em; font-weight: bold; margin-top: 5px; color: #333; }
                table { width: 100%; background: white; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                th { background: #343a40; color: white; padding: 15px; text-align: left; }
                td { padding: 12px 15px; border-bottom: 1px solid #eee; }
                .status-dot { height: 10px; width: 10px; background-color: #28a745; border-radius: 50%; display: inline-block; margin-right: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h1><span class="status-dot"></span>Algo Trading Monitor</h1>
                    <small>Refreshing every 1s</small>
                </div>

                <div class="stats-grid">
                    <div class="card"><h3>Virtual Balance</h3><div style="color:#28a745">$${virtualWallet.balance.toFixed(2)}</div></div>
                    <div class="card"><h3>Locked Capital</h3><div style="color:#dc3545">$${virtualWallet.locked.toFixed(2)}</div></div>
                    <div class="card"><h3>Active Pairs</h3><div>${Object.keys(marketState).length} / ${PAIRS.length}</div></div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Pair (Y / X)</th>
                            <th>Live Z-Score</th>
                            <th>Beta Ratio</th>
                            <th>Prices (X / Y)</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `;
    res.send(html);
});

app.listen(port, () => {
    console.log(`Web Dashboard running on port ${port}`);
});

// --- 4. MATH ENGINE ---
class KalmanFilter {
    constructor(delta = 1e-4, R = 1e-3) {
        this.x = 0; // Beta
        this.P = 1; 
        this.Q = delta;
        this.R = R;
    }

    update(priceX, priceY) {
        this.P = this.P + this.Q;
        const prediction = this.x * priceX;
        const error = priceY - prediction;
        const S = (this.P * priceX * priceX) + this.R;
        const K = (this.P * priceX) / S;
        this.x = this.x + (K * error);
        this.P = (1 - K * priceX) * this.P;
        return { error, stdDev: Math.sqrt(S) };
    }
}

// --- 5. EXECUTION ENGINE ---
async function runPair(exchange, symbolY, symbolX) {
    const kf = new KalmanFilter();
    const pairName = `${symbolY}-${symbolX}`;
    
    // Initialize Dashboard State
    marketState[pairName] = { z: 0, beta: 0, px: 0, py: 0 };

    try {
        // WARMUP (Fetch 50 hours of history)
        const [histY, histX] = await Promise.all([
            exchange.fetchOHLCV(symbolY, '1h', undefined, 50),
            exchange.fetchOHLCV(symbolX, '1h', undefined, 50)
        ]);
        for (let i = 0; i < Math.min(histY.length, histX.length); i++) {
            kf.update(histX[i][4], histY[i][4]);
        }
    } catch (e) {
        // If a pair fails (e.g., KCS not on Binance), we just log and skip it
        console.log(`[${pairName}] Startup Error: ${e.message} (Removing from list)`);
        delete marketState[pairName];
        return; 
    }

    // REAL-TIME LOOP
    while (true) {
        try {
            const [tickerY, tickerX] = await Promise.all([
                exchange.fetchTicker(symbolY),
                exchange.fetchTicker(symbolX)
            ]);
            const py = tickerY.last;
            const px = tickerX.last;

            const { error, stdDev } = kf.update(px, py);
            const zScore = error / stdDev;

            // Update Frontend
            marketState[pairName] = { z: zScore, beta: kf.x, px: px, py: py };

            // Logic
            const pos = activePositions[pairName];
            if (!pos) {
                if (virtualWallet.balance - virtualWallet.locked >= CONFIG.capitalPerPair) {
                    if (zScore > CONFIG.entryZ) enterVirtualTrade(pairName, 'SHORT_SPREAD', py, px);
                    else if (zScore < -CONFIG.entryZ) enterVirtualTrade(pairName, 'LONG_SPREAD', py, px);
                }
            } else {
                if (Math.abs(zScore) > CONFIG.stopLossZ) exitVirtualTrade(pairName, py, px, "STOP LOSS");
                else if (pos.type === 'SHORT_SPREAD' && zScore <= CONFIG.exitZ) exitVirtualTrade(pairName, py, px, "PROFIT");
                else if (pos.type === 'LONG_SPREAD' && zScore >= -CONFIG.exitZ) exitVirtualTrade(pairName, py, px, "PROFIT");
            }

        } catch (e) {
            console.log(`[${pairName}] Error: ${e.message}`);
        }
        
        // Randomize delay slightly to prevent API bans (2s - 4s)
        const delay = Math.floor(Math.random() * 2000) + 2000;
        await new Promise(r => setTimeout(r, delay));
    }
}

// --- HELPERS ---
function enterVirtualTrade(pairName, type, py, px) {
    const size = CONFIG.capitalPerPair / 2;
    activePositions[pairName] = { type, entryY: py, entryX: px, qtyY: size/py, qtyX: size/px };
    virtualWallet.locked += CONFIG.capitalPerPair;
    console.log(`OPEN: ${pairName}`.green);
}

function exitVirtualTrade(pairName, currentY, currentX, reason) {
    const pos = activePositions[pairName];
    let pnl = 0;
    if (pos.type === 'SHORT_SPREAD') pnl = (pos.entryY - currentY)*pos.qtyY + (currentX - pos.entryX)*pos.qtyX;
    else pnl = (currentY - pos.entryY)*pos.qtyY + (pos.entryX - currentX)*pos.qtyX;

    virtualWallet.locked -= CONFIG.capitalPerPair;
    virtualWallet.balance += pnl;
    delete activePositions[pairName];
    console.log(`CLOSE: ${pairName} ($${pnl.toFixed(2)})`.cyan);
}

// --- LAUNCH ---
const exchange = new ccxt.binance();
console.log(`Starting ${PAIRS.length} Pairs...`);
PAIRS.forEach(p => runPair(exchange, p[0], p[1]));

