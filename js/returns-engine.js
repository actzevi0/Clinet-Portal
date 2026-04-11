/**
 * ============================================================
 * returns-engine.js
 * Investment Return Calculation Engine
 * 
 * METHODS IMPLEMENTED:
 * 1. Modified Dietz - for single-period return excluding cash flows
 * 2. Chain-linked Modified Dietz - for multi-period (monthly chain)
 * 3. Simple (beginning/end) - fallback when no cash-flow data
 * 
 * KEY PRINCIPLE:
 *   Return = (EndValue - BeginValue - NetCashFlow) 
 *            / (BeginValue + WeightedNetCashFlow)
 * 
 *   Weighted CF = Σ (CF_i × (D - d_i) / D)
 *   where D = total days in period, d_i = day of the cash flow
 * ============================================================
 */

const ReturnsEngine = (() => {

  /**
   * Parse a month string like "01/25" to a Date (first day of month)
   */
  function parseMonth(mm_yy) {
    const [mm, yy] = mm_yy.split('/');
    return new Date(2000 + parseInt(yy), parseInt(mm) - 1, 1);
  }

  /**
   * Get number of days in a month given "MM/YY" string
   */
  function daysInMonth(mm_yy) {
    const [mm, yy] = mm_yy.split('/');
    return new Date(2000 + parseInt(yy), parseInt(mm), 0).getDate();
  }

  /**
   * Modified Dietz return for a single period (one month)
   * 
   * @param {number} beginValue   - Portfolio value at start of period
   * @param {number} endValue     - Portfolio value at end of period  
   * @param {Array}  cashFlows    - Array of {date: Date, amount: number}
   *                                positive = deposit, negative = withdrawal
   * @param {Date}   periodStart  - Start date of period
   * @param {Date}   periodEnd    - End date of period
   * @returns {number|null}       - Return as decimal (0.05 = 5%) or null
   */
  function modifiedDietz(beginValue, endValue, cashFlows, periodStart, periodEnd) {
    if (beginValue == null || endValue == null) return null;
    if (beginValue === 0 && (cashFlows == null || cashFlows.length === 0)) return null;

    const D = (periodEnd - periodStart) / (1000 * 60 * 60 * 24); // total days

    let netCF = 0;
    let weightedCF = 0;

    if (cashFlows && cashFlows.length > 0) {
      for (const cf of cashFlows) {
        const cfDate = cf.date instanceof Date ? cf.date : new Date(cf.date);
        // Days remaining in period after this cash flow
        const daysRemaining = (periodEnd - cfDate) / (1000 * 60 * 60 * 24);
        const weight = D > 0 ? daysRemaining / D : 0.5;
        netCF += cf.amount;
        weightedCF += cf.amount * weight;
      }
    }

    const denominator = beginValue + weightedCF;
    if (denominator === 0) return null;

    const ret = (endValue - beginValue - netCF) / denominator;
    return ret;
  }

  /**
   * Calculate Modified Dietz for a calendar month
   * 
   * @param {string} monthStr     - "MM/YY" e.g. "03/25"
   * @param {number} beginValue   - Value at end of previous month (= start of this month)
   * @param {number} endValue     - Value at end of this month
   * @param {Array}  monthEvents  - Events occurring in this month
   *                                [{day: 15, amount: 50000, type: 'deposit'|'withdrawal'|'transfer_in'|'transfer_out'}]
   * @returns {number|null}       decimal return
   */
  function monthlyReturn(monthStr, beginValue, endValue, monthEvents) {
    if (beginValue == null || endValue == null) return null;

    const [mm, yy] = monthStr.split('/');
    const year = 2000 + parseInt(yy);
    const month = parseInt(mm) - 1;
    const periodStart = new Date(year, month, 1);
    const D = new Date(year, month + 1, 0).getDate(); // days in month
    const periodEnd = new Date(year, month, D, 23, 59, 59);

    const cashFlows = [];
    if (monthEvents) {
      for (const ev of monthEvents) {
        // Deposits and transfer_in are positive flows
        // Withdrawals and transfer_out are negative flows
        let amount = 0;
        if (ev.type === 'deposit' || ev.type === 'transfer_in') {
          amount = Math.abs(ev.amount);
        } else if (ev.type === 'withdrawal' || ev.type === 'transfer_out') {
          amount = -Math.abs(ev.amount);
        }
        if (amount !== 0) {
          const day = ev.day || 1;
          cashFlows.push({
            date: new Date(year, month, day),
            amount: amount
          });
        }
      }
    }

    return modifiedDietz(beginValue, endValue, cashFlows, periodStart, periodEnd);
  }

  /**
   * Chain-link monthly returns to get cumulative return over a range.
   * Uses geometric linking: (1+r1)(1+r2)...(1+rn) - 1
   * 
   * @param {Array} monthlyReturns - Array of decimal returns per month
   * @returns {number|null}
   */
  function chainLink(monthlyReturns) {
    const valid = monthlyReturns.filter(r => r !== null && r !== undefined && !isNaN(r));
    if (valid.length === 0) return null;
    const product = valid.reduce((acc, r) => acc * (1 + r), 1);
    return product - 1;
  }

  /**
   * Calculate YTD return for a product using chain-linked monthly returns.
   * 
   * @param {Object} product - product object from client JSON
   * @param {Object} allEvents - events keyed by "MM/YY" 
   * @param {string} startMonth - e.g. "01/25"
   * @param {string} endMonth   - e.g. "12/25"
   * @returns {number|null}
   */
  function ytdReturn(product, allEvents, startMonth, endMonth) {
    const months = getAllMonthsBetween(startMonth, endMonth);
    const monthlyRets = [];
    const mv = product.monthly_values;

    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      const prev = i === 0 ? null : months[i - 1];
      const beginVal = prev ? mv[prev] : null;
      const endVal = mv[m];

      if (beginVal == null || endVal == null) continue;

      // Get events for this product in this month
      const productEvents = getProductEventsForMonth(product, allEvents, m);
      const ret = monthlyReturn(m, beginVal, endVal, productEvents);
      if (ret !== null) monthlyRets.push(ret);
    }

    return chainLink(monthlyRets);
  }

  /**
   * Calculate monthly return matrix for ALL products and ALL months.
   * Returns { 'productName': { 'MM/YY': returnDecimal } }
   * 
   * @param {Array}  products   - array of product objects
   * @param {Object} allEvents  - all events in the client JSON
   * @param {Array}  months     - array of "MM/YY" strings
   * @returns {Object}
   */
  function buildReturnMatrix(products, allEvents, months) {
    const matrix = {};

    for (const product of products) {
      matrix[product.id] = {};
      const mv = product.monthly_values;

      for (let i = 0; i < months.length; i++) {
        const m = months[i];
        const prev = i === 0 ? null : months[i - 1];

        // We need a valid begin value
        let beginVal = prev ? mv[prev] : null;
        const endVal = mv[m];

        // Special case: if prev is null or beginVal is null, check if product started this month
        // If the product had its very first deposit this month, beginVal = 0
        if (beginVal == null && endVal != null) {
          const productEvents = getProductEventsForMonth(product, allEvents, m);
          const hasOpeningDeposit = productEvents && productEvents.some(e => 
            e.type === 'deposit' || e.type === 'transfer_in'
          );
          if (hasOpeningDeposit) {
            beginVal = 0;
          }
        }

        if (beginVal == null || endVal == null) {
          matrix[product.id][m] = null;
          continue;
        }

        const productEvents = getProductEventsForMonth(product, allEvents, m);
        const ret = monthlyReturn(m, beginVal, endVal, productEvents);
        matrix[product.id][m] = ret;
      }
    }

    return matrix;
  }

  /**
   * Get events relevant to a specific product for a specific month.
   * 
   * @param {Object} product
   * @param {Object} allEvents  - from client JSON: { "MM/YY": [ {product_id, day, amount, type} ] }
   * @param {string} monthStr
   * @returns {Array}
   */
  function getProductEventsForMonth(product, allEvents, monthStr) {
    if (!allEvents || !allEvents[monthStr]) return [];
    return allEvents[monthStr].filter(e => e.product_id === product.id);
  }

  /**
   * Build portfolio-level monthly return (weighted by beginning values).
   * Uses Modified Dietz at portfolio level.
   */
  function buildPortfolioReturnMatrix(products, allEvents, months) {
    const matrix = {};

    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      const prev = i === 0 ? null : months[i - 1];

      let portfolioBegin = 0;
      let portfolioEnd = 0;
      let netCF = 0;
      let weightedCF = 0;

      const [mm, yy] = m.split('/');
      const year = 2000 + parseInt(yy);
      const month = parseInt(mm) - 1;
      const D = new Date(year, month + 1, 0).getDate();

      for (const product of products) {
        const mv = product.monthly_values;
        const endVal = mv[m];
        const beginVal = prev ? mv[prev] : null;

        if (endVal != null) portfolioEnd += endVal;
        if (beginVal != null) portfolioBegin += beginVal;

        // Collect cash flows
        const events = getProductEventsForMonth(product, allEvents, m);
        for (const ev of events) {
          let amount = 0;
          if (ev.type === 'deposit' || ev.type === 'transfer_in') amount = Math.abs(ev.amount);
          else if (ev.type === 'withdrawal' || ev.type === 'transfer_out') amount = -Math.abs(ev.amount);
          if (amount !== 0) {
            const day = ev.day || 1;
            const daysRemaining = D - day;
            const weight = D > 0 ? daysRemaining / D : 0.5;
            netCF += amount;
            weightedCF += amount * weight;
          }
        }
      }

      const denominator = portfolioBegin + weightedCF;
      if (denominator === 0 || portfolioBegin === 0) {
        matrix[m] = null;
      } else {
        matrix[m] = (portfolioEnd - portfolioBegin - netCF) / denominator;
      }
    }

    return matrix;
  }

  /**
   * Generate an array of "MM/YY" strings between two months (inclusive)
   */
  function getAllMonthsBetween(start, end) {
    const months = [];
    let [mm, yy] = start.split('/').map(Number);
    const [emm, eyy] = end.split('/').map(Number);

    while (yy < eyy || (yy === eyy && mm <= emm)) {
      months.push(`${String(mm).padStart(2,'0')}/${String(yy).padStart(2,'0')}`);
      mm++;
      if (mm > 12) { mm = 1; yy++; }
    }
    return months;
  }

  /**
   * Calculate portfolio total values across all active products for each month
   */
  function buildPortfolioTotals(products, months) {
    const totals = {};
    for (const m of months) {
      totals[m] = 0;
      for (const p of products) {
        const v = p.monthly_values[m];
        if (v != null) totals[m] += v;
      }
    }
    return totals;
  }

  /**
   * Calculate Since-Inception return for a product using Modified Dietz.
   * Opening value = 0, chain-links all months from inception.
   */
  function sinceInceptionReturn(product, allEvents, months) {
    // Find first month with data
    const allProductMonths = months.filter(m => product.monthly_values[m] != null);
    if (allProductMonths.length < 2) return null;

    const monthlyRets = [];
    for (let i = 1; i < allProductMonths.length; i++) {
      const m = allProductMonths[i];
      const prev = allProductMonths[i - 1];
      const beginVal = product.monthly_values[prev];
      const endVal = product.monthly_values[m];
      if (beginVal == null || endVal == null) continue;
      const events = getProductEventsForMonth(product, allEvents, m);
      const ret = monthlyReturn(m, beginVal, endVal, events);
      if (ret !== null) monthlyRets.push(ret);
    }

    // For the very first month (first deposit), return is 0
    // We don't include it as it inflates the return
    return chainLink(monthlyRets);
  }

  /**
   * Format return as percentage string
   */
  function formatReturn(ret, decimals = 2) {
    if (ret === null || ret === undefined || isNaN(ret)) return '—';
    const pct = ret * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(decimals)}%`;
  }

  /**
   * Get color for a return value (for heatmap)
   */
  function returnColor(ret, maxAbs = 0.05) {
    if (ret === null || ret === undefined || isNaN(ret)) {
      return { bg: 'transparent', text: 'var(--text-dim)', label: '—' };
    }
    const intensity = Math.min(Math.abs(ret) / maxAbs, 1);
    if (ret > 0.0005) {
      const g = Math.round(100 + intensity * 110);
      const rb = Math.round(255 - intensity * 160);
      return {
        bg: `rgba(${rb}, ${g}, ${rb}, 0.85)`,
        text: intensity > 0.5 ? '#fff' : 'var(--success)',
        label: formatReturn(ret, 1)
      };
    } else if (ret < -0.0005) {
      const r = Math.round(200 + intensity * 55);
      const gb = Math.round(255 - intensity * 200);
      return {
        bg: `rgba(${r}, ${gb}, ${gb}, 0.85)`,
        text: intensity > 0.5 ? '#fff' : 'var(--danger)',
        label: formatReturn(ret, 1)
      };
    } else {
      return { bg: 'var(--bg-card2)', text: 'var(--text-dim)', label: '0.0%' };
    }
  }

  /**
   * Format currency (Israeli Shekel)
   */
  function formatILS(value, compact = false) {
    if (value == null || isNaN(value)) return '—';
    if (compact) {
      if (Math.abs(value) >= 1000000) return `₪${(value/1000000).toFixed(2)}מ׳`;
      if (Math.abs(value) >= 1000) return `₪${(value/1000).toFixed(0)}א׳`;
    }
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(value);
  }

  // Public API
  return {
    monthlyReturn,
    buildReturnMatrix,
    buildPortfolioReturnMatrix,
    buildPortfolioTotals,
    ytdReturn,
    sinceInceptionReturn,
    chainLink,
    getAllMonthsBetween,
    returnColor,
    formatReturn,
    formatILS,
    getProductEventsForMonth,
    parseMonth
  };

})();

// Export for use in Node.js if needed (for testing)
if (typeof module !== 'undefined') module.exports = ReturnsEngine;
