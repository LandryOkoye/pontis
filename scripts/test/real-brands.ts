// Real names the demo catalogue must never use or imitate (ADR 0019 section 3): companies,
// funds, tokens and issuers of regulated products. A name matches as a whole word or phrase, case
// and punctuation aside, so "Apple" is refused and "Applewood" is not. Generic words that are also
// ordinary English or common acronyms ("meta", "near", "sec") are left out on purpose: the list
// guards against copying a brand, it does not enumerate every word.

const list = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const REAL_BRAND_DENYLIST: readonly string[] = list(`
  apple, microsoft, google, alphabet, amazon, facebook, tesla, nvidia, netflix, oracle,
  salesforce, adobe, airbnb, shopify, paypal, mastercard, samsung, alibaba, tencent, siemens,
  volkswagen, toyota, boeing, airbus, lockheed, walmart, costco, nike, starbucks, pfizer,
  moderna, novartis, roche, nestle, unilever, coca cola, pepsi, exxon, exxonmobil, chevron,
  totalenergies, aramco, glencore, rio tinto, bhp, barrick, newmont, freeport, tidewater, maple,
  jpmorgan, goldman sachs, morgan stanley, citigroup, wells fargo, bank of america, hsbc,
  barclays, credit suisse, deutsche bank, santander, blackrock, vanguard, fidelity, state street,
  invesco, franklin templeton, pimco, schroders, amundi, ishares, spdr, wisdomtree, ark invest,
  grayscale, coinbase, binance, kraken, robinhood, charles schwab, berkshire, nasdaq, euronext,
  euroclear, clearstream, broadridge, securitize, tokeny, backed finance, ondo finance,
  franklin onchain, centrifuge, goldfinch, maple finance, toucan, klima, paxos, tether,
  circle internet, makerdao, ethena, frax, usdt, usdc, paxg, xaut, buidl, benji, ousg, usdy,
  usde, ibit, bitcoin, ethereum, solana, chainlink, uniswap, aave, lido, pax gold, tether gold,
  spy, qqq, voo, gld, slv, tlt, bil, sgov, finma, bafin, cssf, adgm, difc
`);

/** Real token and fund tickers a catalogue symbol must not equal, with or without its dashes. */
export const REAL_TICKER_DENYLIST: readonly string[] = list(`
  usdt, usdc, usde, usdy, usdp, dai, frax, paxg, xaut, buidl, benji, ousg, btc, eth, sol, near,
  link, uni, aave, ldo, mkr, ibit, spy, qqq, voo, gld, slv, tlt, bil, sgov, shy, ief, lqd, hyg,
  vti, iwm, eem, efa
`);
