# Changelog

## 2026-02-26

### Single Position Page (`/positions/:chainId/:tokenId`)

#### Added
- Auto-refresh position data every 20 seconds
- Flash color indicators (green/red for 3s) on token amounts when values change across Position, Fees Earned, and Total Value sections
- Flash on header values: market price, total value, position value, earnings
- **Total Value** section combining liquidity + fees, with stacked bars and per-token rows
- **P/L** (profit/loss) in USD: `current value + total collected - total deposited`
- **APR**: P/L annualized as a percentage
- **Fees APR**: fee-only earnings annualized, ignoring impermanent loss/gain
- Full cash flow accounting using on-chain events: `IncreaseLiquidity`, `DecreaseLiquidity`, `Collect`, `Transfer`
- **Position history** timeline replacing simple "Minted on..." text:
  - 🎉 Minted · ➕ Added liquidity · 📤 Removed liquidity & collected fees · ➖ Removed liquidity · 💰 Collected fees · 🔥 Burned
  - Each line shows: token amounts, date (dd/mm/yyyy hh:mm:ss), clickable shortened tx hash linking to the chain's block explorer
  - `DecreaseLiquidity` + `Collect` in the same transaction merged into one line
- Stablecoin fallback pricing: when `useUSDCValue` can't price a token, uses pool prices if the other token is a stablecoin (USDC, USDT, DAI, BUSD, FRAX, LUSD), treating 1 stablecoin = $1

### Positions List Page (`/positions`)

#### Added
- Stablecoin fallback pricing (same logic as single position page)
- **Total Value** stat (position + fees) shown before Position and Fees in each card (full and mini)

#### Removed
- "Migrate to V4" button
- APR display (incorrect API-provided value)

### Shared Components

#### Changed
- `LiquidityPositionAmountRows`: added optional `flashColor` prop, applied to token amount text only (not USD fiat value)
