const express = require('express');
const ccxt = require('ccxt');
const colors = require('colors');

// --- 1. CONFIGURATION: THE "CENTURION" LIST (100+ PAIRS) ---
const PAIRS = [
    // --- TIER 1: THE KINGS ---
    ['BTC/USDT', 'USDT'], ['ETH/USDT', 'USDT'], ['BNB/USDT', 'USDT'], ['SOL/USDT', 'USDT'], ['XRP/USDT', 'USDT'],
    ['ADA/USDT', 'USDT'], ['DOGE/USDT', 'USDT'], ['AVAX/USDT', 'USDT'], ['TRX/USDT', 'USDT'], ['DOT/USDT', 'USDT'],
    ['MATIC/USDT', 'USDT'], ['LTC/USDT', 'USDT'], ['BCH/USDT', 'USDT'], ['LINK/USDT', 'USDT'], ['XLM/USDT', 'USDT'],
    ['ATOM/USDT', 'USDT'], ['UNI/USDT', 'USDT'], ['ETC/USDT', 'USDT'], ['FIL/USDT', 'USDT'], ['NEAR/USDT', 'USDT'],
    
    // --- TIER 2: HIGH VOLUME ALTS ---
    ['APT/USDT', 'USDT'], ['ARB/USDT', 'USDT'], ['OP/USDT', 'USDT'], ['RNDR/USDT', 'USDT'], ['INJ/USDT', 'USDT'],
    ['STX/USDT', 'USDT'], ['IMX/USDT', 'USDT'], ['GRT/USDT', 'USDT'], ['LDO/USDT', 'USDT'], ['QNT/USDT', 'USDT'],
    ['VET/USDT', 'USDT'], ['MKR/USDT', 'USDT'], ['AAVE/USDT', 'USDT'], ['SNX/USDT', 'USDT'], ['ALGO/USDT', 'USDT'],
    ['AXS/USDT', 'USDT'], ['SAND/USDT', 'USDT'], ['MANA/USDT', 'USDT'], ['EOS/USDT', 'USDT'], ['THETA/USDT', 'USDT'],
    
    // --- TIER 3: MEME & SPECULATIVE ---
    ['SHIB/USDT', 'USDT'], ['PEPE/USDT', 'USDT'], ['FLOKI/USDT', 'USDT'], ['BONK/USDT', 'USDT'], ['WIF/USDT', 'USDT'],
    ['MEME/USDT', 'USDT'], ['ORDI/USDT', 'USDT'], ['SATS/USDT', 'USDT'], ['BOME/USDT', 'USDT'], ['DOGS/USDT', 'USDT'],
    
    // --- TIER 4: AI & GAMING ---
    ['FET/USDT', 'USDT'], ['AGIX/USDT', 'USDT'], ['OCEAN/USDT', 'USDT'], ['GALA/USDT', 'USDT'], ['APE/USDT', 'USDT'],
    ['ILV/USDT', 'USDT'], ['GMT/USDT', 'USDT'], ['ENJ/USDT', 'USDT'], ['MAGIC/USDT', 'USDT'], ['PIXEL/USDT', 'USDT'],
    
    // --- TIER 5: DEFI & INFRA ---
    ['CRV/USDT', 'USDT'], ['CVX/USDT', 'USDT'], ['COMP/USDT', 'USDT'], ['DYDX/USDT', 'USDT'], ['GMX/USDT', 'USDT'],
    ['JUP/USDT', 'USDT'], ['PYTH/USDT', 'USDT'], ['TIA/USDT', 'USDT'], ['SEI/USDT', 'USDT'], ['SUI/USDT', 'USDT'],
    ['BLUR/USDT', 'USDT'], ['ENS/USDT', 'USDT'], ['MINA/USDT', 'USDT'], ['FLOW/USDT', 'USDT'], ['CHZ/USDT', 'USDT'],
    
    // --- TIER 6: LEGACY & POW ---
    ['KAS/USDT', 'USDT'], ['BSV/USDT', 'USDT'], ['ZEC/USDT', 'USDT'], ['DASH/USDT', 'USDT'], ['NEO/USDT', 'USDT'],
    ['QTUM/USDT', 'USDT'], ['IOTA/USDT', 'USDT'], ['XMR/USDT', 'USDT'], ['XTZ/USDT', 'USDT'], ['KAVA/USDT', 'USDT'],
    
    // --- TIER 7: VOLATILITY ZONES ---
    ['RUNE/USDT', 'USDT'], ['EGLD/USDT', 'USDT'], ['FXS/USDT', 'USDT'], ['KLAY/USDT', 'USDT'], ['1INCH/USDT', 'USDT'],
    ['CAKE/USDT', 'USDT'], ['ROSE/USDT', 'USDT'], ['MASK/USDT', 'USDT'], ['JASMY/USDT', 'USDT'], ['WLD/USDT', 'USDT'],
    ['TWT/USDT', 'USDT'], ['LUNC/USDT', 'USDT'], ['USTC/USDT', 'USDT'], ['GAS/USDT', 'USDT'], ['TRB/USDT', 'USDT']
];

const STRATEGY = {
    timeframe: '5m',     // 5-minute candles
    period: 20,          // SMA 20 (Back to Previous Settings)
    stdDev: 2.0,         // Width 2.0
    shift: 10,           // Shift 10 (Displacement)
    capital: 25.0,       // Position size ($)
    useTrendFilter: true // EMA 50 Trend Filter
};

// --- 2. STATE ---
let marketState = {}; 
let virtualWallet = { balance: 250.00, locked: 0.00 };
let activePositions = {}; 
let lastProcessedCandle = {}; 

// --- 3. DASHBOARD ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    // SORTING LOGIC: 
    // 1. Active Trades
    // 2. Near Breakout (Testing Upper/Lower)
    // 3. Alphabetical
    const sortedPairs = Object.keys(marketState).sort((a, b) => {
        if (activePositions[a] && !activePositions[b]) return -1;
        if (!activePositions[a] && activePositions[b]) return 1;
        
        const dataA = marketState[a];
        const dataB = marketState[b];
        const nearA = (dataA.lastHigh > dataA.upper || dataA.lastLow < dataA.lower);
        const nearB = (dataB.lastHigh > dataB.upper || dataB.lastLow < dataB.lower);
        
        if (nearA && !nearB) return -1;
        if (!nearA && nearB) return 1;
        
        return a.localeCompare(b);
    });

    let tableRows = sortedPairs.map(pair => {
        const data = marketState[pair];
        const pos = activePositions[pair];
        
        let statusHtml = '<span style="color:#ccc">WAITING</span>';
        let rowStyle = '';

        if (pos) {
            let pnlPct = 0;
            if (pos.type === 'LONG') pnlPct = (data.close - pos.entryPrice) / pos.entryPrice * 100;
            else pnlPct = (pos.entryPrice - data.close) / pos.entryPrice * 100;
            
            const pnlColor = pnlPct >= 0 ? 'green' : 'red';
            statusHtml = `<strong style="color:blue">${pos.type}</strong> <span style="color:${pnlColor}">(${pnlPct.toFixed(2)}%)</span>`;
            rowStyle = 'background-color: #f0f8ff; border-left: 5px solid blue;';
        } else {
            const trend = data.close > data.ema ? '<b style="color:green">BULL</b>' : '<b style="color:red">BEAR</b>';
            
            if (data.lastHigh > data.upper) statusHtml = `<span style="color:orange; font-weight:bold">TEST UPPER</span> ${trend}`;
            else if (data.lastLow < data.lower) statusHtml = `<span style="color:orange; font-weight:bold">TEST LOWER</span> ${trend}`;
            else statusHtml = `<span style="color:gray">RANGE</span> ${trend}`;
        }

        const dateObj = new Date(data.timestamp);
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit' });

        return `
            <tr style="${rowStyle}">
                <td><strong>${pair}</strong></td>
                <td>
                    $${data.close}
                    <div style="font-size:0.8em; color:gray">${timeStr}</div>
                </td>
                <td style="color:#d35400">$${data.upper.toFixed(4)}</td>
                <td style="color:#27ae60">$${data.lower.toFixed(4)}</td>
                <td style="color:blue">$${data.mid.toFixed(4)}</td>
                <td>${statusHtml}</td>
            </tr>
        `;
    }).join('');

    res.send(`
        <html>
        <head>
            <meta http-equiv="refresh" content="2">
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding: 20px; background: #f8f9fa; }
                .stats { display: flex; gap: 15px; margin-bottom: 20px; }
                .card { background: white; padding: 15px 25px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .num { font-size: 1.4em; font-weight: bold; margin-top: 5px; }
                table { width: 100%; background: white; border-collapse: collapse; font-size: 0.9em; }
                th { background: #343a40; color: white; padding: 10px; text-align: left; position: sticky; top: 0; }
                td { padding: 8px; border-bottom: 1px solid #eee; }
            </style>
        </head>
        <body>
            <h2>🚀 Centurion Bot (100 Pairs | SMA 20 | Shift 10)</h2>
            <div class="stats">
                <div class="card"><div>Balance</div><div class="num" style="color:#27ae60">$${virtualWallet.balance.toFixed(2)}</div></div>
                <div class="card"><div>Locked</div><div class="num" style="color:#c0392b">$${virtualWallet.locked.toFixed(2)}</div></div>
                <div class="card"><div>Positions</div><div class="num">${Object.keys(activePositions).length}</div></div>
                <div class="card"><div>Scanning</div><div class="num">${Object.keys(marketState).length} / ${PAIRS.length}</div></div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Asset</th>
                        <th>Close (Time)</th>
                        <th>Shifted Upper</th>
                        <th>Shifted Lower</th>
                        <th>Shifted Median</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </body>
        </html>
    `);
});

app.listen(port, () => {
    console.log(`Dashboard running on port ${port}`);
});

// --- 4. MATH ENGINE (SMA Based) ---
function calculateSMA(data, period) {
    if (data.length < period) return 0;
    return data.slice(-period).reduce((sum, val) => sum + val, 0) / period;
}

function calculateEMA(data, period) {
    if (data.length < period) return 0;
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = (data[i] * k) + (ema * (1 - k));
    }
    return ema;
}

function calculateStdDev(data, period, sma) {
    if (data.length < period) return 0;
    const variance = data.slice(-period).reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    return Math.sqrt(variance);
}

// --- 5. TRADING ENGINE ---
async function runPair(exchange, symbol) {
    marketState[symbol] = { close: 0, upper: 0, lower: 0, mid: 0, ema: 0, timestamp: 0, lastHigh: 0, lastLow: 0 };
    lastProcessedCandle[symbol] = 0;

    while (true) {
        try {
            // Fetch ~100 candles to cover EMA50 + Shift10 + SMA20
            const candles = await exchange.fetchOHLCV(symbol, STRATEGY.timeframe, undefined, 100);
            if (candles.length < 80) throw new Error("Not enough data");

            // --- INDEXING ---
            const signalIndex = candles.length - 2; // Last closed candle
            const signalCandle = candles[signalIndex];
            
            const closePrice = signalCandle[4];
            const highPrice  = signalCandle[2];
            const lowPrice   = signalCandle[3];
            const timestamp  = signalCandle[0];

            // --- 1. SHIFTED DATA SLICE ---
            const shiftedIndex = signalIndex - STRATEGY.shift;
            
            // Get slice for SMA 20 (Previous settings)
            const smaSlice = candles.slice(shiftedIndex - STRATEGY.period + 1, shiftedIndex + 1).map(c => c[4]);
            
            // --- 2. CALCULATE INDICATORS ---
            const sma = calculateSMA(smaSlice, STRATEGY.period);
            const std = calculateStdDev(smaSlice, STRATEGY.period, sma);
            
            const upper = sma + (STRATEGY.stdDev * std);
            const lower = sma - (STRATEGY.stdDev * std);

            // --- 3. TREND FILTER (EMA 50 Current) ---
            const emaSlice = candles.slice(0, signalIndex + 1).map(c => c[4]);
            const trendEMA = calculateEMA(emaSlice, 50);

            marketState[symbol] = { 
                close: closePrice, 
                upper, lower, mid: sma, ema: trendEMA, 
                lastHigh: highPrice, lastLow: lowPrice, 
                timestamp 
            };

            const pos = activePositions[symbol];

            // --- 4. TRADE LOGIC ---
            if (timestamp > lastProcessedCandle[symbol]) {
                if (!pos && virtualWallet.balance - virtualWallet.locked >= STRATEGY.capital) {
                    
                    // LONG: Rejection Lower + Price > Trend EMA
                    if (lowPrice < lower && closePrice > lower && closePrice > trendEMA) {
                        enterTrade(symbol, 'LONG', closePrice);
                    }
                    // SHORT: Rejection Upper + Price < Trend EMA
                    else if (highPrice > upper && closePrice < upper && closePrice < trendEMA) {
                        enterTrade(symbol, 'SHORT', closePrice);
                    }
                }
                lastProcessedCandle[symbol] = timestamp;
            }

            // --- 5. EXIT LOGIC ---
            if (pos) {
                if (pos.type === 'LONG') {
                    if (highPrice >= sma) closeTrade(symbol, sma, 'TARGET');
                    else if (closePrice < lower * 0.99) closeTrade(symbol, closePrice, 'STOP'); 
                } else {
                    if (lowPrice <= sma) closeTrade(symbol, sma, 'TARGET');
                    else if (closePrice > upper * 1.01) closeTrade(symbol, closePrice, 'STOP');
                }
            }

        } catch (e) {
            // Silent error to keep console clean with 100 pairs
            // console.log(`[${symbol}] Error: ${e.message}`);
        }

        // SLOW LOOP: 5-10 seconds delay to prevent rate limits with 100 pairs
        const delay = Math.floor(Math.random() * 5000) + 5000;
        await new Promise(r => setTimeout(r, delay));
    }
}

// --- HELPERS ---
function enterTrade(symbol, type, price) {
    activePositions[symbol] = { type, entryPrice: price, time: new Date() };
    virtualWallet.locked += STRATEGY.capital;
    console.log(`OPEN ${type}: ${symbol} @ $${price}`.green.bold);
}

function closeTrade(symbol, price, reason) {
    const pos = activePositions[symbol];
    let pnl = 0;
    if (pos.type === 'LONG') pnl = (price - pos.entryPrice) * (STRATEGY.capital / pos.entryPrice);
    else pnl = (pos.entryPrice - price) * (STRATEGY.capital / pos.entryPrice);
    
    virtualWallet.locked -= STRATEGY.capital;
    virtualWallet.balance += pnl;
    delete activePositions[symbol];
    
    const color = pnl > 0 ? 'green' : 'red';
    console.log(`CLOSE ${symbol}: $${pnl.toFixed(2)} (${reason})`[color]);
}

// --- MAIN ---
async function main() {
    console.log("--- LAUNCHING 100-PAIR CENTURION BOT ---".yellow);
    
    const exchange = new ccxt.binance({
        'enableRateLimit': true,
        'options': { 'defaultType': 'future' } // Futures Market
    });

    // Launch all 100 pairs with 0.5s staggered start (50s total startup)
    for (const pair of PAIRS) {
        runPair(exchange, pair[0]);
        await new Promise(r => setTimeout(r, 500));
        process.stdout.write(`\rLaunching: ${pair[0]}   `);
    }
    console.log("\n--- ALL SYSTEMS LIVE ---".green);
}

main();