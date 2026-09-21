// ==========================================
// CLIENT-SIDE ANALYTICS SERVICE (LOCAL AGGREGATIONS)
// ==========================================
(function() {
  /**
   * Fetch Low Stock Alert items ordered by severity.
   * Products with stock <= lowStockThreshold.
   */
  async function getLowStockProducts() {
    if (!window.FlexiDB || !window.FlexiDB.db) return [];
    const db = window.FlexiDB.db;

    const allProducts = await db.products.toArray();
    const lowStock = allProducts.filter(p => {
      const threshold = Number(p.lowStockThreshold != null ? p.lowStockThreshold : 10);
      return Number(p.currentStock) <= threshold;
    });

    // Order by severity: out-of-stock first, then ascending currentStock
    return lowStock.sort((a, b) => {
      if (a.currentStock <= 0 && b.currentStock > 0) return -1;
      if (b.currentStock <= 0 && a.currentStock > 0) return 1;
      return a.currentStock - b.currentStock;
    });
  }

  /**
   * Top Selling Products aggregated across custom time window.
   * @param {'today' | '7days' | '30days' | 'all'} timeWindow
   * @returns {Promise<Array>}
   */
  async function getTopSellingProducts(timeWindow = '30days') {
    if (!window.FlexiDB || !window.FlexiDB.db) return [];
    const db = window.FlexiDB.db;

    let cutoffDate = null;
    const now = new Date();
    if (timeWindow === 'today') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeWindow === '7days') {
      cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeWindow === '30days') {
      cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Fetch sales within timeWindow
    let salesQuery = db.sales;
    if (cutoffDate) {
      salesQuery = salesQuery.where('timestamp').aboveOrEqual(cutoffDate.toISOString());
    }
    const sales = await salesQuery.toArray();
    const saleIds = new Set(sales.map(s => s.id));

    if (saleIds.size === 0) return [];

    // Fetch sale items using indexed anyOf query
    const saleIdsArr = Array.from(saleIds);
    const filteredItems = await db.saleItems.where('saleId').anyOf(saleIdsArr).toArray();

    // Aggregate by productId
    const productAgg = new Map();
    for (const item of filteredItems) {
      const pId = item.productId;
      if (!productAgg.has(pId)) {
        productAgg.set(pId, {
          productId: pId,
          name: item.productName || 'Unknown Product',
          barcode: item.barcode || '',
          totalQuantity: 0,
          totalRevenue: 0,
          totalProfit: 0
        });
      }
      const agg = productAgg.get(pId);
      agg.totalQuantity += (item.quantity || 0);
      agg.totalRevenue += (item.lineTotal || 0);
      agg.totalProfit += (item.lineProfit || 0);
    }

    // Convert map to sorted array (highest volume first)
    return Array.from(productAgg.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }

  /**
   * Revenue, Margin & Payment Method Analytics
   * @param {Date|string} startDate
   * @param {Date|string} endDate
   */
  async function getRevenueAnalytics(startDate = null, endDate = null) {
    if (!window.FlexiDB || !window.FlexiDB.db) {
      return { totalRevenue: 0, totalCost: 0, netProfit: 0, marginPercent: 0, orderCount: 0, avgBasket: 0, actualCashCollected: 0, uncollectedCredit: 0, paymentMethods: {} };
    }
    const db = window.FlexiDB.db;

    let sales;
    if (startDate && endDate) {
      sales = await db.sales.where('timestamp').between(new Date(startDate).toISOString(), new Date(endDate).toISOString(), true, true).toArray();
    } else if (startDate) {
      sales = await db.sales.where('timestamp').aboveOrEqual(new Date(startDate).toISOString()).toArray();
    } else if (endDate) {
      sales = await db.sales.where('timestamp').belowOrEqual(new Date(endDate).toISOString()).toArray();
    } else {
      sales = await db.sales.toArray();
    }

    // Filter out refunded sales
    const validSales = sales.filter(s => s.status !== 'refunded');

    const orderCount = validSales.length;
    const totalRevenue = validSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    const totalCost = validSales.reduce((sum, s) => sum + (Number(s.totalCost) || 0), 0);
    const netProfit = totalRevenue - totalCost;
    const marginPercent = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;
    const avgBasket = orderCount > 0 ? (totalRevenue / orderCount) : 0;

    // Fetch debt repayments and uncollected debt in this timeframe
    let debtPayments = [];
    let openDebts = [];
    try {
      if (db.debtPayments) {
        if (startDate && endDate) {
          debtPayments = await db.debtPayments.where('paidAt').between(new Date(startDate).toISOString(), new Date(endDate).toISOString(), true, true).toArray();
        } else if (startDate) {
          debtPayments = await db.debtPayments.where('paidAt').aboveOrEqual(new Date(startDate).toISOString()).toArray();
        } else if (endDate) {
          debtPayments = await db.debtPayments.where('paidAt').belowOrEqual(new Date(endDate).toISOString()).toArray();
        } else {
          debtPayments = await db.debtPayments.toArray();
        }
      }
      if (db.debts) {
        openDebts = await db.debts.where('status').equals('open').toArray();
      }
    } catch (e) {}

    const directCashSales = validSales
      .filter(s => (s.paymentMethod || 'cash').toLowerCase() !== 'credit')
      .reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);

    const debtCollections = debtPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const actualCashCollected = directCashSales + debtCollections;
    const uncollectedCredit = openDebts.reduce((sum, d) => sum + (Number(d.remainingAmount) || 0), 0);

    // Payment method breakdown
    const paymentMethods = validSales.reduce((acc, s) => {
      const method = (s.paymentMethod || 'cash').toLowerCase();
      if (!acc[method]) acc[method] = { count: 0, total: 0 };
      acc[method].count += 1;
      acc[method].total += (Number(s.totalAmount) || 0);
      return acc;
    }, {});

    return {
      orderCount,
      totalRevenue,
      totalCost,
      netProfit,
      marginPercent,
      avgBasket,
      actualCashCollected,
      debtCollections,
      uncollectedCredit,
      paymentMethods
    };
  }

  window.AnalyticsService = {
    getLowStockProducts,
    getTopSellingProducts,
    getRevenueAnalytics
  };
})();
