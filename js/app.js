if (typeof ChartDataLabels !== "undefined") {
  Chart.register(ChartDataLabels);
}

/*
 * アプリケーション本体
 *
 * 役割：
 * - CSV読み込み
 * - 項目選択肢の準備
 * - 単純集計の表示
 * - クロス集計プレビュー
 * - 出力対象の管理
 * - 印刷 / PDF出力
 */

let rawData = [];
let fieldGroups = {};

let crossChartInstance = null;

const simpleChartInstances = {};
const outputTargetChartInstances = {};

let outputTargets = [];
let currentAnalysisResult = null;
let aiCrossAnalysisResults = [];

const colorPalette = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#64748b"
];

document.addEventListener("DOMContentLoaded", () => {

  const csvFileInput = document.getElementById("csvFileInput");
  const runAnalysisBtn = document.getElementById("runAnalysisBtn");
  const geminiApiKeyInput =
    document.getElementById("geminiApiKey");
  const runAIAnalysisBtn =
    document.getElementById("runAIAnalysisBtn");
    if (geminiApiKeyInput && runAIAnalysisBtn) {

      geminiApiKeyInput.addEventListener("input", () => {

        const apiKey =
        geminiApiKeyInput.value.trim();

       runAIAnalysisBtn.disabled =
        apiKey === "";

  });

}
async function testGeminiAPI(apiKey) {

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

  const response = await fetch(url, {

    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },

    body: JSON.stringify({

      contents: [
        {
          parts: [
            {
              text: "こんにちは。これはGemini APIの接続テストです。短く返答してください。"
            }
          ]
        }
      ]

    })

  });

  if (!response.ok) {

    const errorText =
      await response.text();

    throw new Error(
      `Gemini APIエラー: ${response.status}\n${errorText}`
    );

  }

  const result =
    await response.json();

  return result;
}

  const addOutputTargetBtn = document.getElementById("addOutputTargetBtn");
  const printSimpleBtn = document.getElementById("printSimpleBtn");
  const printSimpleFromReportBtn =
    document.getElementById("printSimpleFromReportBtn");
  const printAllBtn = document.getElementById("printAllBtn");
  const outputTargetsContainer =
    document.getElementById("outputTargetsContainer");
  const newCrossAnalysisBtn =
    document.getElementById("newCrossAnalysisBtn");
  const reportTitleInput =
    document.getElementById("reportTitleInput");

  /*
   * 1. CSV読み込み
   */
  if (csvFileInput) {
    csvFileInput.addEventListener("change", (e) => {

      const file = e.target.files[0];

      if (!file) {
        return;
      }

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",

        complete: (results) => {

          rawData = results.data;

          /*
           * 新しいCSVを読み込んだ場合、
           * 前のCSVに対する出力対象はすべてリセットする。
           */
          outputTargets = [];
          currentAnalysisResult = null;

          clearCharts();
          clearCrossPreview();
          updateOutputTargetsUI();

          const fileInfo = document.getElementById("fileInfo");

          if (fileInfo) {
            fileInfo.textContent =
              `読み込み完了: ${rawData.length} 件のデータを検出しました。`;

            fileInfo.classList.remove("hidden");
          }

          const printActionBar =
            document.getElementById("printActionBar");

          if (printActionBar) {
            printActionBar.classList.remove("hidden");
          }

          /*
           * CSVの項目を解析
           */
          parseFields(results.meta.fields || []);

          /*
           * クロス集計用の選択肢を作成
           */
          setupSelectOptions();

          /*
           * 単純集計はCSV読み込み後に自動表示
           */
          renderSimpleAnalysis();

      /*
      * AI分析用に全クロス集計を自動生成
      */
        generateAllAICrossAnalyses();

          const aiData = buildAIAnalysisData();

          console.log("AI分析用データ:");
          console.log(aiData);

          const aiPrompt =
        buildAIAnalysisPrompt(aiData);

        console.log("Geminiに渡すプロンプト:");
        console.log(aiPrompt);
        }
      });
    });
  }

  /*
   * 2. クロス集計実行
   */
  if (runAnalysisBtn) {

    runAnalysisBtn.addEventListener("click", () => {

      const rowSelect = document.getElementById("rowSelect");
      const colSelect = document.getElementById("colSelect");

      if (!rowSelect || !colSelect) {
        return;
      }

      const rowCol = rowSelect.value;
      const colCol = colSelect.value;

      if (!rowCol || !colCol) {
        alert("行項目と列項目を選択してください。");
        return;
      }

      if (rowCol === colCol) {
        alert("行項目と列項目には異なる項目を選択してください。");
        return;
      }

      renderCrossAnalysis(rowCol, colCol);
    });
  }

  /*
   * 3. 現在のクロス集計を出力対象に追加
   */
  if (addOutputTargetBtn) {

    addOutputTargetBtn.addEventListener("click", () => {

      if (!currentAnalysisResult) {
        alert("出力対象に追加するクロス集計がありません。");
        return;
      }

      const row = String(currentAnalysisResult.rowCol).trim();
      const col = String(currentAnalysisResult.colCol).trim();

      /*
       * 同じ組み合わせを二重登録しない
       */
      const isDuplicate = outputTargets.some((item) => {
        return (
          String(item.rowCol).trim() === row &&
          String(item.colCol).trim() === col
        );
      });

      if (isDuplicate) {
        alert(`「${row} × ${col}」は、すでに出力対象に追加されています。`);
        return;
      }

      /*
       * 現在の分析結果をコピーして保持
       */
      outputTargets.push(
        JSON.parse(JSON.stringify(currentAnalysisResult))
      );

      updateOutputTargetsUI();

      alert(`「${row} × ${col}」を出力対象に追加しました。`);
    });
  }

   /*
   * 4. 単純集計のみを印刷
   */
  function printSimpleOnly() {

    updatePrintReportTitle();

    document.body.classList.add("print-simple-only");

    window.print();

    setTimeout(() => {
      document.body.classList.remove("print-simple-only");
    }, 500);
  }

  if (printSimpleBtn) {
    printSimpleBtn.addEventListener("click", () => {
      printSimpleOnly();
    });
  }

  if (printSimpleFromReportBtn) {
    printSimpleFromReportBtn.addEventListener("click", () => {
      printSimpleOnly();
    });
  }

  /*
   * 5. 最終レポートを印刷
   *
   * 単純集計
   * +
   * 出力対象のクロス集計
   */
  if (printAllBtn) {

    printAllBtn.addEventListener("click", () => {
      updatePrintReportTitle();
      if (outputTargets.length === 0) {
      

        const answer = confirm(
          "クロス集計の出力対象はありません。\n" +
          "単純集計のみを印刷しますか？"
        );

        if (!answer) {
          return;
        }
      }

      window.print();
    });
  }

  /*
   * 6. 出力対象から削除
   *
   * イベント委譲を利用する。
   */
  if (outputTargetsContainer) {

    outputTargetsContainer.addEventListener("click", (e) => {

      if (!e.target.classList.contains("delete-btn")) {
        return;
      }

      const index = parseInt(
        e.target.getAttribute("data-index"),
        10
      );

      if (isNaN(index)) {
        return;
      }

      removeOutputTarget(index);
    });
  }

  /*
   * 7. 新しいクロス集計を作成
   */
  if (newCrossAnalysisBtn) {

    newCrossAnalysisBtn.addEventListener("click", () => {

      const analysisControls =
        document.getElementById("analysisControls");

      if (!analysisControls) {
        return;
      }

      analysisControls.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

});

/*
 * レポート名を印刷用表示に反映
 */
function updatePrintReportTitle() {

  const input =
    document.getElementById("reportTitleInput");

  const title =
    document.getElementById("printReportTitle");

  if (!input || !title) {
    return;
  }

  const reportName =
    input.value.trim();

  if (reportName) {
    title.textContent = reportName;
  } else {
    title.textContent = "アンケート集計レポート";
  }
}

/*
 * CSV項目を分類する
 */
function parseFields(fields) {

  fieldGroups = {
    SA: [],
    MA: {}
  };

  fields.forEach((field) => {

    if (field.includes("_")) {

      const [groupName] = field.split("_");

      if (!fieldGroups.MA[groupName]) {
        fieldGroups.MA[groupName] = [];
      }

      fieldGroups.MA[groupName].push(field);

    } else {

      fieldGroups.SA.push(field);
    }
  });
}


/*
 * クロス集計用selectを設定
 */
function setupSelectOptions() {

  const rowSelect = document.getElementById("rowSelect");
  const colSelect = document.getElementById("colSelect");

  if (!rowSelect || !colSelect) {
    return;
  }

  rowSelect.innerHTML = "";
  colSelect.innerHTML = "";

  fieldGroups.SA.forEach((field) => {

    rowSelect.appendChild(
      new Option(field, field)
    );

    colSelect.appendChild(
      new Option(field, field)
    );
  });

  /*
   * 2項目以上あれば、列側は2番目を初期選択
   */
  if (fieldGroups.SA.length > 1) {
    colSelect.selectedIndex = 1;
  }

  const controls =
    document.getElementById("analysisControls");

  if (controls && fieldGroups.SA.length > 1) {
    controls.classList.remove("hidden");
  }
}


/*
 * 単純集計を表示
 */
function renderSimpleAnalysis() {

  if (rawData.length === 0) {
    return;
  }

  const container =
    document.getElementById("simpleTablesContainer");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  /*
   * 前回の単純集計グラフを破棄
   */
  Object.keys(simpleChartInstances).forEach((key) => {

    if (simpleChartInstances[key]) {
      simpleChartInstances[key].destroy();
    }

    delete simpleChartInstances[key];
  });

  /*
   * SA項目を1項目ずつ集計
   */
  fieldGroups.SA.forEach((field, idx) => {

    const res = calculateFrequency(
      rawData,
      field
    );

    const canvasId =
      `simpleChart_sa_${idx}`;

    const wrapper =
      document.createElement("div");

    wrapper.className = "table-wrapper";

    wrapper.style.cssText =
      "display:flex; gap:20px; flex-wrap:wrap; " +
      "align-items:center; margin-bottom:30px;";

    let tableHtml = `
      <div style="flex:1; min-width:280px;">
        <h3>■ ${escapeHtml(field)} <small>(単一回答)</small></h3>

        <table>
          <thead>
            <tr>
              <th>選択肢</th>
              <th>件数</th>
              <th>割合 (%)</th>
            </tr>
          </thead>

          <tbody>
    `;

    res.categories.forEach((cat) => {

      tableHtml += `
        <tr>
          <td>${escapeHtml(cat.category)}</td>
          <td>${cat.count}</td>
          <td>${cat.percentage}%</td>
        </tr>
      `;
    });

    tableHtml += `
            <tr style="font-weight:bold; background:#f8fafc;">
              <td>有効回答数 (n)</td>
              <td>${res.totalValid}</td>
              <td>100.0%</td>
            </tr>

            <tr>
              <td>無回答等</td>
              <td>${res.missing}</td>
              <td>-</td>
            </tr>

          </tbody>
        </table>
      </div>

      <div style="flex:1; min-width:280px; max-width:350px; height:240px;">
        <canvas id="${canvasId}"></canvas>
      </div>
    `;

    wrapper.innerHTML = tableHtml;

    container.appendChild(wrapper);

    /*
     * グラフ作成
     */
    const canvasEl =
      document.getElementById(canvasId);

    if (canvasEl) {

      const ctx =
        canvasEl.getContext("2d");

      simpleChartInstances[canvasId] =
        new Chart(ctx, {

          type: "doughnut",

          data: {
            labels:
              res.categories.map(
                (c) => c.category
              ),

            datasets: [
              {
                data:
                  res.categories.map(
                    (c) => Number(c.percentage)
                  ),

                backgroundColor:
                  colorPalette.slice(
                    0,
                    res.categories.length
                  )
              }
            ]
          },

          options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {

              datalabels: {
                color: "#ffffff",
                textStrokeColor:
                  "rgba(0,0,0,0.6)",
                textStrokeWidth: 2,

                font: {
                  weight: "bold",
                  size: 13
                },

                formatter: (value, ctx) => {

                  if (value < 5) {
                    return "";
                  }

                  return `${ctx.chart.data.labels[ctx.dataIndex]}\n${value}%`;
                }
              },

              legend: {
                position: "bottom",

                labels: {
                  boxWidth: 10,
                  font: {
                    size: 12
                  }
                }
              }
            }
          }
        });
    }
  });

  const simpleResults =
    document.getElementById("simpleResults");

  if (simpleResults) {
    simpleResults.classList.remove("hidden");
  }
}

/*
 * AI分析用に全クロス集計を自動生成
 *
 * SA項目から異なる2項目の組み合わせをすべて作成し、
 * それぞれのクロス集計結果を保存する。
 */
function generateAllAICrossAnalyses() {

  aiCrossAnalysisResults = [];

  const fields = fieldGroups.SA;

  /*
   * SA項目が2つ未満ならクロス集計できない
   */
  if (fields.length < 2) {
    return;
  }

  /*
   * SA項目を2つずつ組み合わせる
   */
  for (let i = 0; i < fields.length; i++) {

    for (let j = i + 1; j < fields.length; j++) {

      const rowCol = fields[i];
      const colCol = fields[j];

      /*
       * 既存のクロス集計計算処理を利用
       */
      const res =
        calculateCrosstabAndChiSquare(
          rawData,
          rowCol,
          colCol,
          false
        );

      /*
       * AI分析用の結果として保存
       */
      aiCrossAnalysisResults.push({

        rowCol: String(rowCol),
        colCol: String(colCol),

        res: res

      });
    }
  }
}

/*
 * AI分析用データを作成
 *
 * 元データから、
 * - 回答者数
 * - 単純集計
 * - 全クロス集計
 *
 * をまとめて、AIに渡せる形にする。
 */
function buildAIAnalysisData() {

  /*
   * 単純集計
   */
  const simpleResults = [];

  fieldGroups.SA.forEach((field) => {

    const res =
      calculateFrequency(
        rawData,
        field
      );

    simpleResults.push({

      field: String(field),

      categories:
        res.categories.map((cat) => ({
          category: String(cat.category),
          count: Number(cat.count),
          percentage: Number(cat.percentage)
        })),

      totalValid:
        Number(res.totalValid),

      missing:
        Number(res.missing)

    });
  });


  /*
   * 全クロス集計
   */
  const crossResults =
    aiCrossAnalysisResults.map((item) => {

      return {

        rowCol:
          String(item.rowCol),

        colCol:
          String(item.colCol),

        rowCats:
          item.res.rowCats,

        colCats:
          item.res.colCats,

        observed:
          item.res.observed,

        rowTotals:
          item.res.rowTotals,

        colTotals:
          item.res.colTotals,

        chi2:
          item.res.chi2,

        df:
          item.res.df,

        pValue:
          item.res.pValue,

        rawPValue:
          item.res.rawPValue,

        smallExpectedCount:
          item.res.smallExpectedCount,

        totalCells:
          item.res.totalCells
      };
    });


  /*
   * AIに渡す最終データ
   */
  return {

    totalResponses:
      rawData.length,

    simpleResults:
      simpleResults,

    crossResults:
      crossResults

  };
}


/*
 * クロス集計を実行してプレビュー表示
 */
function renderCrossAnalysis(rowCol, colCol) {

  const res =
    calculateCrosstabAndChiSquare(
      rawData,
      rowCol,
      colCol,
      false
    );

  /*
   * 現在表示中のクロス集計
   */
  currentAnalysisResult = {
    rowCol: String(rowCol),
    colCol: String(colCol),
    res: res
  };

  /*
   * 警告表示
   */
  const alertBox =
    document.getElementById("alertBox");

  if (alertBox) {

    alertBox.classList.add("hidden");
    alertBox.innerHTML = "";

    if (res.smallExpectedCount > 0) {

      alertBox.innerHTML =
        `⚠️ 期待度数5未満のセルが ` +
        `${res.smallExpectedCount} セルあります。` +
        `（全 ${res.totalCells} セル中）`;

      alertBox.classList.remove("hidden");
    }
  }

  /*
   * クロス集計表
   */
  let html = `
    <table>
      <thead>
        <tr>
          <th>${escapeHtml(rowCol)} ＼ ${escapeHtml(colCol)}</th>
  `;

  res.colCats.forEach((c) => {

    html += `
      <th>${escapeHtml(c)}</th>
    `;
  });

  html += `
          <th>合計</th>
        </tr>
      </thead>

      <tbody>
  `;

  res.rowCats.forEach((r) => {

    html += `
      <tr>
        <th>${escapeHtml(r)}</th>
    `;

    res.colCats.forEach((c) => {

      const cnt =
        res.observed[r][c];

      const rowPct =
        res.rowTotals[r] > 0
          ? (
              (cnt / res.rowTotals[r]) * 100
            ).toFixed(1)
          : "0.0";

      html += `
        <td>
          ${cnt}
          <br>
          <small style="color:#64748b;">
            (${rowPct}%)
          </small>
        </td>
      `;
    });

    html += `
        <td>
          <strong>${res.rowTotals[r]}</strong>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  const crossTableContainer =
    document.getElementById(
      "crossTableContainer"
    );

  if (crossTableContainer) {
    crossTableContainer.innerHTML = html;
  }

  /*
   * 統計値
   */
  const statChi2 =
    document.getElementById("statChi2");

  const statDf =
    document.getElementById("statDf");

  const statPValue =
    document.getElementById("statPValue");

  if (statChi2) {
    statChi2.textContent =
      res.chi2 ?? "-";
  }

  if (statDf) {
    statDf.textContent =
      res.df ?? "-";
  }

  if (statPValue) {
    statPValue.textContent =
      res.pValue ?? "-";
  }

  /*
   * 解釈
   */
  const interp =
    document.getElementById(
      "statInterpretation"
    );

  if (interp) {

    if (
      typeof res.rawPValue === "number" &&
      res.rawPValue < 0.05
    ) {

      interp.innerHTML =
        `<strong>` +
        `5%水準で統計的に有意な関連が確認されました ` +
        `(p = ${res.pValue})` +
        `</strong>`;

    } else {

      interp.innerHTML =
        `今回のデータから、5%水準で統計的に有意な関連は確認されませんでした ` +
        `(p = ${res.pValue})`;
    }
  }

  /*
   * 現在のクロス集計グラフを作り直す
   */
  if (crossChartInstance) {

    crossChartInstance.destroy();
    crossChartInstance = null;
  }

  const datasets =
    res.colCats.map((colCat, colIdx) => {

      return {
        label: colCat,

        data:
          res.rowCats.map((r) => {

            if (res.rowTotals[r] <= 0) {
              return 0;
            }

            return parseFloat(
              (
                (res.observed[r][colCat] /
                  res.rowTotals[r]) *
                100
              ).toFixed(1)
            );
          }),

        backgroundColor:
          colorPalette[
            colIdx % colorPalette.length
          ]
      };
    });

  const crossChartCanvas =
    document.getElementById("crossChart");

  if (crossChartCanvas) {

    const ctx =
      crossChartCanvas.getContext("2d");

    crossChartInstance =
      new Chart(ctx, {

        type: "bar",

        data: {
          labels: res.rowCats,
          datasets: datasets
        },

        options: {
          responsive: true,
          maintainAspectRatio: false,

          scales: {
            x: {
              stacked: true
            },

            y: {
              stacked: true,
              max: 100
            }
          },

          plugins: {

            title: {
              display: true,
              text:
                `${rowCol} × ${colCol} 構成比 (%)`,
              font: {
                size: 15
              }
            },

            datalabels: {

              color: "#ffffff",

              textStrokeColor:
                "rgba(0,0,0,0.7)",

              textStrokeWidth: 2,

              font: {
                weight: "bold",
                size: 13
              },

              formatter: (value, ctx) => {

                if (value < 5) {
                  return "";
                }

                return (
                  `${ctx.dataset.label}\n` +
                  `${value}%`
                );
              }
            }
          }
        }
      });
  }

  /*
   * プレビュー表示
   */
  const crossResults =
    document.getElementById("crossResults");

  if (crossResults) {
    crossResults.classList.remove("hidden");
  }
}


/*
 * 出力対象一覧を更新
 */
function updateOutputTargetsUI() {

  const container =
    document.getElementById(
      "outputTargetsContainer"
    );

  const countBadge =
    document.getElementById(
      "outputTargetCount"
    );

  const stockCountBadge =
    document.getElementById(
      "stockCountBadge"
    );

  const section =
    document.getElementById(
      "outputTargetsSection"
    );

  if (!container) {
    return;
  }

  /*
   * 既存の出力対象グラフを破棄
   */
  Object.keys(
    outputTargetChartInstances
  ).forEach((key) => {

    if (outputTargetChartInstances[key]) {
      outputTargetChartInstances[key].destroy();
    }

    delete outputTargetChartInstances[key];
  });

  container.innerHTML = "";

  /*
   * 件数表示
   */
  if (countBadge) {
    countBadge.textContent =
      `${outputTargets.length} 件`;
  }

  if (stockCountBadge) {
    stockCountBadge.textContent =
      `出力対象: ${outputTargets.length} 件`;
  }

  /*
   * 出力対象がない場合
   */
  if (outputTargets.length === 0) {

    if (section) {
      section.classList.add("hidden");
    }

    return;
  }

  /*
   * 出力対象がある場合
   */
  if (section) {
    section.classList.remove("hidden");
  }

  /*
   * 一つずつ表示
   */
  outputTargets.forEach((item, idx) => {

    const canvasId =
      `outputTargetCanvas_${idx}`;

    const card =
      document.createElement("div");

    card.className =
      "output-target-card";

    let tableHtml = `
      <button
        class="delete-btn no-print"
        data-index="${idx}">
        出力対象から外す
      </button>

      <h3>
        ${idx + 1}.
        ${escapeHtml(item.rowCol)}
        ×
        ${escapeHtml(item.colCol)}
      </h3>

      <div class="table-wrapper">

        <table>

          <thead>
            <tr>
              <th>
                ${escapeHtml(item.rowCol)}
                ＼
                ${escapeHtml(item.colCol)}
              </th>
    `;

    item.res.colCats.forEach((c) => {

      tableHtml += `
        <th>${escapeHtml(c)}</th>
      `;
    });

    tableHtml += `
              <th>合計</th>
            </tr>
          </thead>

          <tbody>
    `;

    item.res.rowCats.forEach((r) => {

      tableHtml += `
        <tr>
          <th>${escapeHtml(r)}</th>
      `;

      item.res.colCats.forEach((c) => {

        const cnt =
          item.res.observed[r][c];

        const rowPct =
          item.res.rowTotals[r] > 0
            ? (
                (cnt /
                  item.res.rowTotals[r]) *
                100
              ).toFixed(1)
            : "0.0";

        tableHtml += `
          <td>
            ${cnt}
            <br>
            <small style="color:#64748b;">
              (${rowPct}%)
            </small>
          </td>
        `;
      });

      tableHtml += `
          <td>
            <strong>
              ${item.res.rowTotals[r]}
            </strong>
          </td>
        </tr>
      `;
    });

    tableHtml += `
          </tbody>
        </table>

      </div>

      <div class="stats-summary">
        <div class="stats-list">
          <span>
            カイ二乗値:
            ${item.res.chi2 ?? "-"}
          </span>

          <span>
            自由度:
            ${item.res.df ?? "-"}
          </span>

          <span>
            p値:
            ${item.res.pValue ?? "-"}
          </span>
        </div>

        ${
          item.res.rawPValue < 0.05
            ? `<div class="interpretation-box">
                 <strong>
                   5%水準で統計的に有意な関連が確認されました
                 </strong>
               </div>`
            : `<div class="interpretation-box">
                 今回のデータから、5%水準で統計的に有意な関連は確認されませんでした
               </div>`
        }
      </div>

      <div class="chart-container">
        <canvas id="${canvasId}"></canvas>
      </div>
    `;

    card.innerHTML = tableHtml;

    container.appendChild(card);

    /*
     * グラフ
     */
    const canvasEl =
      document.getElementById(canvasId);

    if (canvasEl) {

      const ctx =
        canvasEl.getContext("2d");

      const datasets =
        item.res.colCats.map(
          (colCat, colIdx) => {

            return {
              label: colCat,

              data:
                item.res.rowCats.map((r) => {

                  if (
                    item.res.rowTotals[r] <= 0
                  ) {
                    return 0;
                  }

                  return parseFloat(
                    (
                      (
                        item.res.observed[r][colCat] /
                        item.res.rowTotals[r]
                      ) * 100
                    ).toFixed(1)
                  );
                }),

              backgroundColor:
                colorPalette[
                  colIdx %
                  colorPalette.length
                ]
            };
          }
        );

      outputTargetChartInstances[canvasId] =
        new Chart(ctx, {

          type: "bar",

          data: {
            labels:
              item.res.rowCats,

            datasets: datasets
          },

          options: {
            responsive: true,
            maintainAspectRatio: false,

            scales: {
              x: {
                stacked: true
              },

              y: {
                stacked: true,
                max: 100
              }
            },

            plugins: {

              title: {
                display: true,
                text:
                  `${item.rowCol} × ${item.colCol} 構成比 (%)`
              },

              datalabels: {

                color: "#ffffff",

                textStrokeColor:
                  "rgba(0,0,0,0.7)",

                textStrokeWidth: 2,

                font: {
                  weight: "bold",
                  size: 12
                },

                formatter:
                  (value, ctx) => {

                    if (value < 5) {
                      return "";
                    }

                    return (
                      `${ctx.dataset.label}\n` +
                      `${value}%`
                    );
                  }
              }
            }
          }
        });
    }
  });
}


/*
 * 出力対象から外す
 */
function removeOutputTarget(index) {

  if (
    index < 0 ||
    index >= outputTargets.length
  ) {
    return;
  }

  outputTargets.splice(index, 1);

  updateOutputTargetsUI();
}


/*
 * クロス集計プレビューをクリア
 */
function clearCrossPreview() {

  const crossResults =
    document.getElementById("crossResults");

  if (crossResults) {
    crossResults.classList.add("hidden");
  }

  const crossTableContainer =
    document.getElementById(
      "crossTableContainer"
    );

  if (crossTableContainer) {
    crossTableContainer.innerHTML = "";
  }

  const alertBox =
    document.getElementById("alertBox");

  if (alertBox) {
    alertBox.classList.add("hidden");
    alertBox.innerHTML = "";
  }

  const statChi2 =
    document.getElementById("statChi2");

  const statDf =
    document.getElementById("statDf");

  const statPValue =
    document.getElementById("statPValue");

  const statInterpretation =
    document.getElementById(
      "statInterpretation"
    );

  if (statChi2) {
    statChi2.textContent = "-";
  }

  if (statDf) {
    statDf.textContent = "-";
  }

  if (statPValue) {
    statPValue.textContent = "-";
  }

  if (statInterpretation) {
    statInterpretation.innerHTML = "";
  }

  if (crossChartInstance) {

    crossChartInstance.destroy();
    crossChartInstance = null;
  }
}


/*
 * グラフをすべて破棄
 */
function clearCharts() {

  Object.keys(
    simpleChartInstances
  ).forEach((key) => {

    if (simpleChartInstances[key]) {
      simpleChartInstances[key].destroy();
    }

    delete simpleChartInstances[key];
  });

  Object.keys(
    outputTargetChartInstances
  ).forEach((key) => {

    if (outputTargetChartInstances[key]) {
      outputTargetChartInstances[key].destroy();
    }

    delete outputTargetChartInstances[key];
  });

  if (crossChartInstance) {

    crossChartInstance.destroy();
    crossChartInstance = null;
  }
}


/*
 * HTMLへ文字列を表示する際の安全対策
 */
function escapeHtml(value) {

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/*
 * Geminiに渡すAI分析用プロンプトを作成
 */
function buildAIAnalysisPrompt(aiData) {

  return `
あなたはアンケート結果を分析するアシスタントです。

以下のアンケート集計データをもとに、
回答全体の特徴や注目すべき傾向を整理してください。

【分析上のルール】

・単純集計だけでなく、クロス集計も確認してください。
・統計的に有意な関連がある場合は、そのことを明示してください。
・統計的に有意でない場合でも、回答割合に特徴的な傾向があれば、
  「傾向」として示してください。
・相関や関連が確認された場合でも、因果関係があるとは断定しないでください。
・少数の回答だけを根拠に、一般化した結論を出さないでください。
・データから読み取れないことを推測しないでください。
・数値を示す場合は、元データの数値と矛盾しないようにしてください。

【回答者数】

${aiData.totalResponses} 件

【単純集計】

${JSON.stringify(aiData.simpleResults, null, 2)}

【クロス集計】

${JSON.stringify(aiData.crossResults, null, 2)}

以上のデータをもとに、
アンケート結果から読み取れる主な特徴を整理してください。
`;
}
