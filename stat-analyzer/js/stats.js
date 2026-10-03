/**
 * 統計計算モジュール (stats.js) - 複数回答(MA)拡張版
 */

// 1. 単純集計 (単一回答 SA)
function calculateFrequency(data, colName) {
  const counts = {};
  let totalValid = 0;
  let missing = 0;

  data.forEach(row => {
    const val = row[colName];
    if (val === undefined || val === null || val === "" || val === "無回答") {
      missing++;
    } else {
      counts[val] = (counts[val] || 0) + 1;
      totalValid++;
    }
  });

  const categories = Object.keys(counts);
  const result = categories.map(cat => ({
    category: cat,
    count: counts[cat],
    percentage: totalValid > 0 ? ((counts[cat] / totalValid) * 100).toFixed(1) : "0.0"
  }));

  return {
    categories: result,
    totalValid: totalValid,
    missing: missing,
    totalN: data.length
  };
}

// 2. 単純集計 (複数回答 MA : 0/1方式)
function calculateMAFrequency(data, groupName, columns) {
  const totalN = data.length;
  const categories = [];

  columns.forEach(col => {
    // 1(選択)の件数をカウント
    const optionName = col.replace(`${groupName}_`, "");
    const count = data.reduce((sum, row) => sum + (String(row[col]) === "1" ? 1 : 0), 0);
    const percentage = totalN > 0 ? ((count / totalN) * 100).toFixed(1) : "0.0";
    
    categories.push({
      category: optionName,
      count: count,
      percentage: percentage
    });
  });

  return {
    groupName: groupName,
    categories: categories,
    totalN: totalN
  };
}

// 3. クロス集計とPearsonカイ二乗検定 (MAフラグ付き)
function calculateCrosstabAndChiSquare(data, rowCol, colCol, isMA = false) {
  const rowCats = [...new Set(data.map(d => d[rowCol]))].filter(v => v && v !== "無回答");
  const colCats = [...new Set(data.map(d => d[colCol]))].filter(v => v && v !== "無回答");

  const observed = {};
  rowCats.forEach(r => {
    observed[r] = {};
    colCats.forEach(c => { observed[r][c] = 0; });
  });

  let validN = 0;
  data.forEach(d => {
    const r = d[rowCol];
    const c = d[colCol];
    if (rowCats.includes(r) && colCats.includes(c)) {
      observed[r][c]++;
      validN++;
    }
  });

  const rowTotals = {};
  rowCats.forEach(r => {
    rowTotals[r] = colCats.reduce((sum, c) => sum + observed[r][c], 0);
  });

  const colTotals = {};
  colCats.forEach(c => {
    colTotals[c] = rowCats.reduce((sum, r) => sum + observed[r][c], 0);
  });

  // 複数回答（MA）が含まれる場合はカイ二乗検定を計算しない（独立性の仮定が崩れるため）
  if (isMA) {
    return {
      rowCats, colCats, observed, rowTotals, colTotals, validN,
      isMA: true
    };
  }

  let chi2 = 0;
  let smallExpectedCount = 0;
  const totalCells = rowCats.length * colCats.length;
  const expected = {};

  rowCats.forEach(r => {
    expected[r] = {};
    colCats.forEach(c => {
      const expVal = (rowTotals[r] * colTotals[c]) / validN;
      expected[r][c] = expVal;
      if (expVal < 5) smallExpectedCount++;
      chi2 += Math.pow(observed[r][c] - expVal, 2) / expVal;
    });
  });

  const df = (rowCats.length - 1) * (colCats.length - 1);
  let pValue = 0;
  if (df > 0 && typeof jStat !== 'undefined') {
    pValue = 1 - jStat.chisquare.cdf(chi2, df);
  }

  return {
    rowCats, colCats, observed, expected, rowTotals, colTotals, validN,
    chi2: chi2.toFixed(3),
    df: df,
    pValue: pValue < 0.001 ? "< 0.001" : pValue.toFixed(4),
    rawPValue: pValue,
    smallExpectedCount,
    totalCells,
    smallExpectedRatio: (smallExpectedCount / totalCells) * 100,
    isMA: false
  };
}