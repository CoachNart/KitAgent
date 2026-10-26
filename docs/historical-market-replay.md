# Historical Market Replay (Bybit)

The historical replay evaluates the market-structure guard and strategy signals against candles that were closed at each decision time. It is a research tool, not a profitability guarantee.

## Why use CSV mode?

GitHub-hosted runners may be blocked from Bybit's public API (HTTP 403). CSV mode runs without a network exchange fallback and accepts user-supplied Bybit candle history.

## Required files

The replay always loads four timeframes for each requested symbol because strategies may use higher-timeframe context:

- `SYMBOL_1H.csv`
- `SYMBOL_2H.csv`
- `SYMBOL_4H.csv`
- `SYMBOL_1D.csv`

For the default 10 symbols, that means 40 files. If you only have BTCUSDT data, pass `--symbols=BTCUSDT` and provide the four BTCUSDT files.

Example folder:

```text
bybit-data/
  BTCUSDT_1H.csv
  BTCUSDT_2H.csv
  BTCUSDT_4H.csv
  BTCUSDT_1D.csv
```

Each file must contain at least 80 valid candles and cover a continuous interval. The replay rejects missing/irregular candle intervals rather than silently filling gaps. For a meaningful replay, collect enough history to cover warm-up plus the selected decision snapshots; the default history request is 3,000 candles per timeframe.

## CSV format

The parser accepts a header row with these columns (case-insensitive):

- Time: `startTime`, `timestamp`, `time`, `open_time`, `datetime`, or `date`
- OHLC: `open`, `high`, `low`, `close` (or single-letter aliases)
- Volume: `volume`, `vol`, or `v` (optional)

Timestamps may be Unix seconds, milliseconds, microseconds, or parseable ISO date/time strings. Each row should represent one candle for the timeframe in the filename. Use the Bybit linear perpetual market and the same symbol named in the filename; do not mix spot candles or another exchange's history into this replay. Keep the CSV header and rows, and ensure the timestamps use a consistent timezone/format.

## Run it

First validate the CSV parser:

```bash
npm run test:replay-bybit-csv
```

Then replay one symbol:

```bash
npm run test:market-engine-replay -- --data-dir=./bybit-data --symbols=BTCUSDT --bars=240 --round-trip-cost-bps=10
```

Or replay the default symbol set after supplying every required file:

```bash
npm run test:market-engine-replay -- --data-dir=./bybit-data --bars=240 --round-trip-cost-bps=10
```

The `--timeframes` option selects which execution-timeframe snapshots are evaluated; the data loader still needs the 1H, 2H, 4H and 1D files for each requested symbol. `--history-candles` controls the maximum number of candles used from each CSV (default 3,000; maximum 10,000).

## Interpreting results responsibly

- Use a realistic round-trip cost assumption for your fee tier, spread, and slippage. The default 10 bps is only an assumption.
- Ambiguous candles where both stop and target are touched are not guessed.
- Unresolved trades are not wins or losses.
- Review sample size, net R after costs, drawdown, results by strategy/timeframe, and performance across distinct market regimes.
- The replay does not fully simulate portfolio-level overlapping exposure, funding, partial fills, or account-specific fees.
- A successful test/build does not prove the strategy has an edge. Do not deploy real capital based on this report alone.
