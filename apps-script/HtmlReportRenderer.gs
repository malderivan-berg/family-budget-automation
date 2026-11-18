
/**
 * Family Budget Automation - HtmlReportRenderer.gs
 * Compatible with AI Report Schema v1.0/v1.1 and HTML Template v1.1
 * Renderer transforms AI Report Schema into HTML Template v1.1 placeholders.
 */

var FBA_RENDERER_CONFIG = {
  EMPTY_TEXT: '—',
  DATE_FORMAT: 'yyyy-MM-dd',
  DEFAULT_LANGUAGE: 'en',
  SECTION_ORDER: [
    'Metadata',
    'Executive Dashboard',
    'Watchlist',
    'Top Insights',
    'Family Overview',
    'Family Financial Position',
    'Person Analysis',
    'Recommendations',
    'Summary'
  ]
};

function renderReportHtml(report) {
  validateReportObject_(report);
  var template = buildTemplateHtml_();
  var payload = buildTemplatePayload_(report);
  return applyTemplatePayload_(template, payload);
}

function renderReportHtmlFromJson(reportJson) {

  var report = reportJson;

  //
  // Если передана строка — разбираем JSON.
  //
  if (typeof report === 'string') {
    report = JSON.parse(report);
  }

  //
  // Некоторые внешние сервисы возвращают JSON,
  // содержащий внутри еще одну JSON-строку.
  //
  if (typeof report === 'string') {
    report = JSON.parse(report);
  }

  //
  // Финальная проверка.
  //
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error(
      'renderReportHtmlFromJson: expected report object, received ' +
      Object.prototype.toString.call(report)
    );
  }

  return renderReportHtml(report);

}

/**
 * ============================================================================
 * Рендер HTML непосредственно из ответа внешнего оркестратора (Nodul).
 * ============================================================================
 */
function renderReportHtmlFromNodulResponse(responseJson) {

  var reportJson = extractReportJson_(responseJson);

  return renderReportHtmlFromJson(reportJson);

}

/**
 * ============================================================================
 * Извлекает JSON отчета из ответа внешнего оркестратора (Nodul).
 *
 * Поддерживаемые форматы:
 *
 * 1. Чистый JSON отчета.
 *
 * 2. Markdown:
 *
 *    ```json
 *    {...}
 *    ```
 *
 * 3. JSON Nodul:
 *
 *    {
 *      result: {
 *        content: [
 *          { text: "{...}" }
 *        ]
 *      }
 *    }
 *
 * 4. Комбинированный ответ Nodul:
 *
 *    { transport json ... }
 *    ```json
 *    { report json ... }
 *    ```
 * ============================================================================
 */
function extractReportJson_(response) {

  if (!response) {
    throw new Error('Renderer: empty response.');
  }

  var text = String(response);

  //
  // Берем ПОСЛЕДНИЙ Markdown-блок.
  // Именно он содержит окончательный AI Report.
  //
  var start = text.lastIndexOf('```json');

  if (start >= 0) {

    start += 7;

    var end = text.indexOf('```', start);

    if (end < 0) {
      end = text.length;
    }

    var report = text.substring(start, end).trim();

    JSON.parse(report);

    return report;
  }

  //
  // Если Markdown нет —
  // считаем, что это уже JSON.
  //
  JSON.parse(text);

  return text;

}

function validateReportObject_(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('renderReportHtml: report must be an object');
  }
  if (!report.metadata) {
    report.metadata = {};
  }
}

function buildTemplateHtml_() {
  return [
    '<!DOCTYPE html>',
    '<html lang="{{htmlLang}}" data-theme="dark">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<title>Family Budget Automation — HTML Template v1.1</title>',
    '<meta name="color-scheme" content="dark light">',
    buildTemplateStyles_(),
    '</head>',
    '<body>',
    '  <main class="report" id="reportRoot">',
    '    <section class="panel header" aria-label="Report header">',
    '      <div class="head-row">',
    '        <div class="brand">',
    '          <div class="logo" aria-hidden="true">',
    '            <svg class="icon" viewBox="0 0 24 24">',
    '              <path d="M3 16c4-8 6-4 9-9 2.5-4 5 3 9 0"/>',
    '              <path d="M3 20h18"/>',
    '            </svg>',
    '          </div>',
    '          <div>',
    '            <h1 class="title">Family Budget Automation</h1>',
    '            <div class="meta">',
    '              <span id="metaPeriod">{{metadata.reportPeriod}}</span>',
    '              <span>·</span>',
    '              <span id="metaCurrency">{{metadata.currency}}</span>',
    '              <span>·</span>',
    '              <span id="metaVersion">{{metadata.reportVersion}}</span>',
    '            </div>',
    '          </div>',
    '        </div>',
    '        <div class="chip">{{metadata.generationDate}}</div>',
    '      </div>',
    '    </section>',
    '    <section class="panel">',
    '      <div class="section">',
    '        <div class="sec-head">',
    '          <div><h2>Executive Dashboard</h2><p>Primary status layer for rapid scanning.</p></div>',
    '          <span class="chip">{{executiveDashboard.count}}</span>',
    '        </div>',
    '        <div class="grid-kpi" id="kpiGrid">{{executiveDashboard.items}}</div>',
    '      </div>',
    '      <div class="section" id="watchlistSection">',
    '        <div class="sec-head">',
    '          <div><h2>Watchlist</h2><p>Critical signals requiring attention.</p></div>',
    '          <span class="chip">{{watchlist.count}}</span>',
    '        </div>',
    '        <div class="cards two" id="watchlistGrid">{{watchlist.items}}</div>',
    '      </div>',
    '      <div class="section" id="insightsSection">',
    '        <div class="sec-head">',
    '          <div><h2>Top Insights</h2><p>Short, structured interpretations.</p></div>',
    '          <span class="chip">{{topInsights.count}}</span>',
    '        </div>',
    '        <div class="cards two" id="insightsGrid">{{topInsights.items}}</div>',
    '      </div>',
    '      <div class="section layout-2" id="overviewSection">',
    '        <div>',
    '          <div class="sec-head">',
    '            <div><h2>Family Overview</h2><p>Distribution view for major buckets.</p></div>',
    '          </div>',
    '          <div class="summary-box">{{familyOverview.summary}}</div>',
    '          <div style="height:12px"></div>',
    '          <table class="table" aria-label="Family overview table">',
    '            <thead><tr><th>Bucket</th><th>Share</th><th>Value</th></tr></thead>',
    '            <tbody>{{familyOverview.tableRows}}</tbody>',
    '          </table>',
    '        </div>',
    '        <div>',
    '          <div class="sec-head">',
    '            <div><h2>Family Financial Position</h2><p>Current balance structure and capital composition.</p></div>',
    '          </div>',
    '          <div class="stack">{{familyFinancialPosition.items}}</div>',
    '        </div>',
    '      </div>',
    '      <div class="section" id="peopleSection">',
    '        <div class="sec-head">',
    '          <div><h2>Person Analysis</h2><p>Expandable per-person blocks, schema-driven.</p></div>',
    '          <span class="chip">{{personAnalysis.count}}</span>',
    '        </div>',
    '        <div class="cards three" id="peopleGrid">{{personAnalysis.items}}</div>',
    '      </div>',
    '      <div class="section" id="recommendationsSection">',
    '        <div class="sec-head">',
    '          <div><h2>Recommendations</h2><p>Action-oriented next steps.</p></div>',
    '          <span class="chip">{{recommendations.count}}</span>',
    '        </div>',
    '        <div class="cards" id="recommendationsGrid">{{recommendations.items}}</div>',
    '      </div>',
    '      <div class="section" id="summarySection">',
    '        <div class="sec-head">',
    '          <div><h2>Summary</h2><p>Final assessment and closing state.</p></div>',
    '        </div>',
    '        <div class="summary-box" id="summaryBox">{{summary}}</div>',
    '      </div>',
    '    </section>',
    '    <section class="panel footer">{{metadata.reportVersion}} · {{metadata.analysisVersion}} · Passive HTML View only</section>',
    '  </main>',
    '</body>',
    '</html>'
  ].join('\n');
}

function buildTemplateStyles_() {
  return '<style>' + [
    ':root{--bg:#0b1020;--bg-soft:#11182c;--panel:rgba(18,24,40,.88);--panel-2:rgba(255,255,255,.04);--panel-3:rgba(255,255,255,.06);--text:#eef2ff;--muted:#99a3b8;--sub:#c9d0df;--line:rgba(255,255,255,.08);--accent:#d9b15d;--accent-2:#8fb3ff;--good:#3ad98a;--warn:#ffbf4d;--bad:#ff6b7a;--info:#76a7ff;--shadow:0 20px 45px rgba(0,0,0,.36);--r-xl:28px;--r-lg:20px;--r-md:14px;--r-sm:10px;--max:1040px;--font:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,sans-serif;}',
    '*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;padding:16px 12px 40px;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}svg{display:block;flex:0 0 auto}a{color:inherit}.report{max-width:var(--max);margin:0 auto;display:flex;flex-direction:column;gap:14px}.panel{background:linear-gradient(180deg,var(--panel),rgba(255,255,255,.02));border:1px solid var(--line);border-radius:var(--r-xl);box-shadow:var(--shadow);overflow:hidden;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.header{padding:18px}.head-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.brand{display:flex;gap:12px;align-items:center}.logo{width:44px;height:44px;border-radius:16px;background:linear-gradient(135deg, rgba(217,177,93,.18), rgba(143,179,255,.14));border:1px solid rgba(217,177,93,.22);display:grid;place-items:center;flex:0 0 auto}.title{margin:0;font-size:20px;line-height:1.1;letter-spacing:-.03em}.meta{margin-top:5px;display:flex;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:12px}.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:var(--panel-2);font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--sub);white-space:nowrap}.section{padding:18px}.section+.section{border-top:1px solid var(--line)}.sec-head{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin-bottom:12px}.sec-head h2{margin:0;font-size:17px;line-height:1.15;letter-spacing:-.02em}.sec-head p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.45}.grid-kpi{display:grid;grid-template-columns:1fr;gap:12px}.kpi{padding:15px 15px 14px;border-radius:var(--r-lg);background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01));border:1px solid var(--line);position:relative;overflow:hidden}.kpi::before{content:\"\";position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg, var(--accent), rgba(143,179,255,.92));opacity:.95}.kpi .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.kpi .value{margin-top:8px;font-size:30px;line-height:1;font-weight:800;letter-spacing:-.04em}.kpi .delta{margin-top:7px;font-size:13px;color:var(--good);font-weight:600}.kpi .delta.bad{color:var(--bad)}.kpi .note{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.45}.cards{display:grid;grid-template-columns:1fr;gap:12px}.card{padding:14px;border-radius:var(--r-lg);border:1px solid var(--line);background:rgba(255,255,255,.02)}.card.accent{border-left:4px solid var(--accent)}.card.good{border-left:4px solid var(--good)}.card.warn{border-left:4px solid var(--warn)}.card.bad{border-left:4px solid var(--bad)}.card h3{margin:0 0 6px;font-size:14px;line-height:1.35}.card p{margin:0;color:var(--sub);font-size:13px;line-height:1.55}.row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.pill{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;padding:5px 9px;border-radius:999px;border:1px solid var(--line);font-size:11px;color:var(--sub);background:rgba(255,255,255,.02)}.progress{height:8px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:10px}.fill{height:100%;border-radius:inherit;background:linear-gradient(90deg, var(--accent), rgba(143,179,255,.9))}.layout-2{display:grid;grid-template-columns:1fr;gap:14px}.table{width:100%;border-collapse:collapse;font-size:13px}.table th,.table td{padding:10px 0;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.table th{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:600}.table td:last-child,.table th:last-child{text-align:right}.stack{display:grid;gap:10px}.summary-box{padding:14px;border:1px solid var(--line);border-radius:var(--r-lg);background:rgba(255,255,255,.02)}.summary-box p{margin:0;color:var(--sub);font-size:13px;line-height:1.6}.footer{padding:14px 18px 18px;color:var(--muted);font-size:11px;border-top:1px solid var(--line)}.hidden{display:none!important}@media (min-width:640px){.grid-kpi{grid-template-columns:1.4fr 1fr 1fr}.cards.two{grid-template-columns:1fr 1fr}.cards.three{grid-template-columns:1fr 1fr 1fr}}@media (min-width:900px){.grid-kpi{grid-template-columns:1.6fr 1fr 1fr 1fr}.layout-2{grid-template-columns:1.05fr .95fr}}</style>'
  ].join('');
}

function buildTemplatePayload_(report) {
var meta = report.metadata || {};

return {
htmlLang: escapeHtml_(
meta.language || FBA_RENDERER_CONFIG.DEFAULT_LANGUAGE
),

metadata: {
reportPeriod: escapeHtml_(formatValue_(meta.reportPeriod)),
currency: escapeHtml_(formatValue_(meta.currency)),
reportVersion: escapeHtml_(formatValue_(meta.reportVersion)),
generationDate: escapeHtml_(formatValue_(meta.generationDate)),
analysisVersion: escapeHtml_(formatValue_(meta.analysisVersion))
},

executiveDashboard: {
count: countItems_(
report.executiveDashboard &&
report.executiveDashboard.metrics
? report.executiveDashboard.metrics
: report.executiveDashboard
),
items: renderMetricCards_(
report.executiveDashboard &&
report.executiveDashboard.metrics
? report.executiveDashboard.metrics
: report.executiveDashboard
)
},

watchlist: {
count: countItems_(
report.watchlist &&
report.watchlist.items
? report.watchlist.items
: report.watchlist.metrics
? report.watchlist.metrics
: report.watchlist
),
items: renderMetricCards_(
report.watchlist &&
report.watchlist.items
? report.watchlist.items
: report.watchlist.metrics
? report.watchlist.metrics
: report.watchlist
)
},

topInsights: {
count: countItems_(
report.topInsights &&
report.topInsights.items
? report.topInsights.items
: report.topInsights
),
items: renderInsightCards_(
report.topInsights &&
report.topInsights.items
? report.topInsights.items
: report.topInsights
)
},

familyOverview: buildFamilyOverviewPayload_(
report.familyOverview &&
report.familyOverview.items
? report.familyOverview.items
: report.familyOverview
),

// ---------------------------
// Универсальный familyFinancialPosition
// ---------------------------
familyFinancialPosition: {
items: (function() {
// Получаем raw-значение раздела (может быть metrics, items или любая структура)
var raw = report.familyFinancialPosition &&
report.familyFinancialPosition.metrics
? report.familyFinancialPosition.metrics
: report.familyFinancialPosition &&
report.familyFinancialPosition.items
? report.familyFinancialPosition.items
: report.familyFinancialPosition;

// Если пусто — вернуть пустое состояние
if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) {
return emptyStateHtml_();
}

// Нормализуем в массив элементов
var elements = flattenItems_(raw);

// Для каждого элемента применяем универсальный рендерер
var htmlPieces = [];
for (var i = 0; i < elements.length; i++) {
htmlPieces.push(renderAnyItemForStack_(elements[i]));
}

return htmlPieces.length ? htmlPieces.join('\n') : emptyStateHtml_();
})()
},

personAnalysis: {
count: countItems_(
report.personAnalysis &&
report.personAnalysis.people
? report.personAnalysis.people
: report.personAnalysis &&
report.personAnalysis.items
? report.personAnalysis.items
: report.personAnalysis
),
items: renderPersonCards_(
report.personAnalysis &&
report.personAnalysis.people
? report.personAnalysis.people
: report.personAnalysis &&
report.personAnalysis.items
? report.personAnalysis.items
: report.personAnalysis
)
},

recommendations: {
count: countItems_(
report.recommendations &&
report.recommendations.items
? report.recommendations.items
: report.recommendations
),
items: renderRecommendationCards_(
report.recommendations &&
report.recommendations.items
? report.recommendations.items
: report.recommendations
)
},

summary: renderSummaryValue_(
report.summary &&
report.summary.items
? report.summary.items
: report.summary
)
};
}

function renderAnyItemForStack_(item) {
// Пустые случаи
if (item === undefined || item === null || item === '' || (Array.isArray(item) && item.length === 0)) {
return emptyStateHtml_();
}

// Простые значения — показываем как inline-значение в блоке
if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
return '<div class="card"><div class="text-block">' + renderInlineValue_(item) + '</div></div>';
}

// Массив — рекурсивно рендерим каждый элемент как отдельный блок внутри стека
if (Array.isArray(item)) {
var arr = flattenItems_(item);
var parts = [];
for (var i = 0; i < arr.length; i++) {
parts.push(renderAnyItemForStack_(arr[i]));
}
return parts.join('\n');
}

// Объект — пытаемся распознать метрику или структурированные под-блоки
if (typeof item === 'object') {
// 1) Если объект выглядит как метрика (есть хотя бы поле 'value' или 'unit' или 'title') — использовать существующий рендер метрики
if (item.hasOwnProperty('value') || item.hasOwnProperty('unit') || item.hasOwnProperty('title') || item.hasOwnProperty('id')) {
// renderMetricCard_ уже возвращает HTML-article для KPI
try {
return renderMetricCard_(item);
} catch (e) {
// на случай, если renderMetricCard_ бросит — fallback ниже
}
}

// 2) Если объект содержит ключи, которые соответствуют таблице/группе (например вложенные items/metrics/structure/capital)
var knownCollections = ['items', 'metrics', 'people', 'structure', 'capital', 'changes', 'rows'];
for (var k = 0; k < knownCollections.length; k++) {
var kc = knownCollections[k];
if (item[kc]) {
// используем renderCards_ для коллекции, и применяем renderAnyItemForStack_ к каждому элементу
var col = item[kc];
var flat = flattenItems_(col);
var rendered = [];
for (var j = 0; j < flat.length; j++) {
rendered.push(renderAnyItemForStack_(flat[j]));
}
// Если объект имеет заголовок — показываем его как карточку с заголовком и содержимым
var title = item.title || item.name || item.headline;
if (title) {
return buildCardHtml_('card', title, [rendered.join('\n')]);
}
return rendered.join('\n');
}
}

// 3) Общий объект: показываем его как карточку с перечислением полей (используются renderInlineValue_ для значений)
var lines = [];
var keys = Object.keys(item);
// Если объект маленький и имеет поле 'title' — сделать более компактную карточку
var cardTitle = item.title || item.name || item.headline;
keys.forEach(function(key) {
if (key === 'title' || key === 'name' || key === 'headline') return;
var v = item[key];
if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return;
// Для массивов/объектов — вложенный рендер; для примитивов — renderInlineValue_
if (typeof v === 'object') {
lines.push('<div class="note"><strong>' + escapeHtml_(toTitleCase_(key)) + ':</strong> ' + renderInlineValue_(v) + '</div>');
} else {
lines.push('<div class="note"><strong>' + escapeHtml_(toTitleCase_(key)) + ':</strong> ' + escapeHtml_(formatValue_(v)) + '</div>');
}
});

if (cardTitle) {
return buildCardHtml_('card', cardTitle, lines);
}

// Если нет заголовка — вернуть простую обёртку
return '<article class="card">' + lines.join('\n') + '</article>';
}

// Fallback
return '<div class="card">' + escapeHtml_(String(item)) + '</div>';
}

function applyTemplatePayload_(template, payload) {
  var html = template;
  html = html.replace(/{{htmlLang}}/g, payload.htmlLang);
  html = html.replace(/{{metadata\.reportPeriod}}/g, payload.metadata.reportPeriod);
  html = html.replace(/{{metadata\.currency}}/g, payload.metadata.currency);
  html = html.replace(/{{metadata\.reportVersion}}/g, payload.metadata.reportVersion);
  html = html.replace(/{{metadata\.generationDate}}/g, payload.metadata.generationDate);
  html = html.replace(/{{metadata\.analysisVersion}}/g, payload.metadata.analysisVersion);
  html = html.replace(/{{executiveDashboard\.count}}/g, String(payload.executiveDashboard.count));
  html = html.replace(/{{executiveDashboard\.items}}/g, payload.executiveDashboard.items);
  html = html.replace(/{{watchlist\.count}}/g, String(payload.watchlist.count));
  html = html.replace(/{{watchlist\.items}}/g, payload.watchlist.items);
  html = html.replace(/{{topInsights\.count}}/g, String(payload.topInsights.count));
  html = html.replace(/{{topInsights\.items}}/g, payload.topInsights.items);
  html = html.replace(/{{familyOverview\.summary}}/g, payload.familyOverview.summary);
  html = html.replace(/{{familyOverview\.tableRows}}/g, payload.familyOverview.tableRows);
  html = html.replace(/{{familyFinancialPosition\.items}}/g, payload.familyFinancialPosition.items);
  html = html.replace(/{{personAnalysis\.count}}/g, String(payload.personAnalysis.count));
  html = html.replace(/{{personAnalysis\.items}}/g, payload.personAnalysis.items);
  html = html.replace(/{{recommendations\.count}}/g, String(payload.recommendations.count));
  html = html.replace(/{{recommendations\.items}}/g, payload.recommendations.items);
  html = html.replace(/{{summary}}/g, payload.summary);
  return html;
}

function buildFamilyOverviewPayload_(value) {

  var items = flattenItems_(value);

  if (!items.length) {
    return {
      summary: emptyStateHtml_(),
      tableRows: ''
    };
  }

  var summary = [];
  var rows = [];

  items.forEach(function(item, index) {

    //
    // Простое значение
    //
    if (
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean'
    ) {

      summary.push(
        '<p>' +
        escapeHtml_(formatValue_(item)) +
        '</p>'
      );

      return;
    }

    //
    // Объект
    //
    if (item && typeof item === 'object') {

      var keys = Object.keys(item);

      //
      // Если объект содержит только одно поле —
      // показываем его как текстовый блок.
      //
      if (keys.length === 1) {

        summary.push(
          '<p>' +
          renderInlineValue_(item[keys[0]]) +
          '</p>'
        );

        return;
      }

      //
      // Иначе отображаем все свойства таблицей.
      //
      keys.forEach(function(key) {

        var fieldValue = item[key];

        if (
          fieldValue === undefined ||
          fieldValue === null ||
          fieldValue === '' ||
          (Array.isArray(fieldValue) && fieldValue.length === 0)
        ) {
          return;
        }

        rows.push(
          '<tr>' +
            '<td>' +
              escapeHtml_(toTitleCase_(key)) +
            '</td>' +
            '<td colspan="2">' +
              renderInlineValue_(fieldValue) +
            '</td>' +
          '</tr>'
        );

      });

    }

  });

  return {

    summary: summary.length
      ? summary.join('\n')
      : emptyStateHtml_(),

    tableRows: rows.join('\n')

  };

}

function renderMetricCards_(value) {

  return renderCards_(value, function(item) {
    return renderMetricCard_(item);
  });

}

function renderInsightCards_(value) {

  return renderCards_(value, function(item) {
    return renderInsightCard_(item);
  });

}

function renderRecommendationCards_(value) {

  return renderCards_(value, function(item) {
    return renderRecommendationCard_(item);
  });

}

function renderPersonCards_(value) {

  return renderCards_(value, function(item) {
    return renderPersonCard_(item);
  });

}

function renderMetricCard_(metric) {

  if (!metric || typeof metric !== 'object') {
    return emptyStateHtml_();
  }

  var title = getField_(metric, 'title');
  var value = getField_(metric, 'value');
  var unit = getField_(metric, 'unit');

  var html = [
    '<article class="kpi">'
  ];

  if (title) {
    html.push(
      '<div class="label">' +
      escapeHtml_(formatValue_(title)) +
      '</div>'
    );
  }

  html.push(
    formatPrimaryValue_(value, unit)
  );

  Object.keys(metric).forEach(function(key) {

    if (
      key === 'title' ||
      key === 'value' ||
      key === 'unit'
    ) {
      return;
    }

    var fieldValue = metric[key];

    if (
      fieldValue === undefined ||
      fieldValue === null ||
      fieldValue === '' ||
      (Array.isArray(fieldValue) && fieldValue.length === 0)
    ) {
      return;
    }

    html.push(
      '<div class="note"><strong>' +
      escapeHtml_(toTitleCase_(key)) +
      ':</strong> ' +
      renderInlineValue_(fieldValue) +
      '</div>'
    );

  });

  html.push('</article>');

  return html.join('\n');

}

function renderInsightCard_(insight) {

  if (!insight || typeof insight !== 'object') {
    return emptyStateHtml_();
  }

  var title =
    getField_(insight, 'title') ||
    getField_(insight, 'headline') ||
    getField_(insight, 'name');

  var html = [
    '<article class="card accent">'
  ];

  if (title) {
    html.push(
      '<h3>' +
      escapeHtml_(formatValue_(title)) +
      '</h3>'
    );
  }

  Object.keys(insight).forEach(function(key) {

    if (
      key === 'title' ||
      key === 'headline' ||
      key === 'name'
    ) {
      return;
    }

    var value = insight[key];

    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return;
    }

    html.push(
      '<div class="note"><strong>' +
      escapeHtml_(toTitleCase_(key)) +
      ':</strong> ' +
      renderInlineValue_(value) +
      '</div>'
    );

  });

  html.push('</article>');

  return html.join('\n');

}

function renderRecommendationCard_(recommendation) {

  if (!recommendation || typeof recommendation !== 'object') {
    return emptyStateHtml_();
  }

  var title =
    getField_(recommendation, 'title') ||
    getField_(recommendation, 'headline') ||
    getField_(recommendation, 'name');

  var html = [
    '<article class="card accent">'
  ];

  if (title) {
    html.push(
      '<h3>' +
      escapeHtml_(formatValue_(title)) +
      '</h3>'
    );
  }

  Object.keys(recommendation).forEach(function(key) {

    if (
      key === 'title' ||
      key === 'headline' ||
      key === 'name'
    ) {
      return;
    }

    var value = recommendation[key];

    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return;
    }

    html.push(
      '<div class="note"><strong>' +
      escapeHtml_(toTitleCase_(key)) +
      ':</strong> ' +
      renderInlineValue_(value) +
      '</div>'
    );

  });

  html.push('</article>');

  return html.join('\n');

}

function renderPersonCards_(value) {
  return renderCards_(value, function(item) {
    return renderPersonCard_(item);
  });
}

function renderCards_(value, renderer) {
  var items = flattenItems_(value);
  if (!items.length) return emptyStateHtml_();
  var html = [];
  for (var i = 0; i < items.length; i++) {
    html.push(renderer(items[i], i));
  }
  return html.join('\n');
}

function renderObjectFields_(obj, excludedFields) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return '';
  }

  var excluded = {};
  if (excludedFields && excludedFields.length) {
    for (var i = 0; i < excludedFields.length; i++) {
      excluded[excludedFields[i]] = true;
    }
  }

  var html = [];

  Object.keys(obj).forEach(function(key) {
    if (excluded[key]) {
      return;
    }

    var value = obj[key];

    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return;
    }

    html.push(
      '<div class="note"><strong>' +
      escapeHtml_(toTitleCase_(key)) +
      ':</strong> ' +
      renderInlineValue_(value) +
      '</div>'
    );
  });

  return html.join('\n');
}

function renderMetricCard_(metric) {
  if (!metric || typeof metric !== 'object') {
    return emptyStateHtml_();
  }

  var title =
    getField_(metric, 'title') ||
    getField_(metric, 'name');

  var value = getField_(metric, 'value');
  var unit = getField_(metric, 'unit');

  var html = [
    '<article class="kpi">'
  ];

  if (title) {
    html.push(
      '<div class="label">' +
      escapeHtml_(formatValue_(title)) +
      '</div>'
    );
  }

  html.push(
    formatPrimaryValue_(value, unit)
  );

  html.push(
    formatSecondaryLine_('Change', getField_(metric, 'change'))
  );
  html.push(
    formatSecondaryLine_('Change %', getField_(metric, 'changePercent'))
  );
  html.push(
    formatSecondaryLine_('Trend', getField_(metric, 'trend'))
  );
  html.push(
    formatSecondaryLine_('Status', getField_(metric, 'status'))
  );
  html.push(
    formatSecondaryLine_('Importance', getField_(metric, 'importance'))
  );
  html.push(
    formatTextBlock_(getField_(metric, 'description'))
  );
  html.push(
    formatTextBlock_(getField_(metric, 'comment'))
  );

  var extraFields = renderObjectFields_(
    metric,
    [
      'id',
      'title',
      'name',
      'value',
      'unit',
      'change',
      'changePercent',
      'trend',
      'status',
      'importance',
      'description',
      'comment'
    ]
  );

  if (extraFields) {
    html.push(extraFields);
  }

  html.push('</article>');

  return html.join('\n');
}

function renderInsightCard_(insight) {
  if (!insight || typeof insight !== 'object') {
    return emptyStateHtml_();
  }

  var title =
    getField_(insight, 'title') ||
    getField_(insight, 'headline') ||
    getField_(insight, 'name');

  var html = [
    '<article class="card accent">'
  ];

  if (title) {
    html.push(
      '<h3>' +
      escapeHtml_(formatValue_(title)) +
      '</h3>'
    );
  }

  var extraFields = renderObjectFields_(
    insight,
    [
      'title',
      'headline',
      'name',
      'description',
      'category',
      'priority',
      'impact'
    ]
  );

  html.push(
    formatSecondaryLine_('Category', getField_(insight, 'category'))
  );
  html.push(
    formatSecondaryLine_('Priority', getField_(insight, 'priority'))
  );
  html.push(
    formatSecondaryLine_('Impact', getField_(insight, 'impact'))
  );
  html.push(
    formatTextBlock_(getField_(insight, 'description'))
  );

  if (extraFields) {
    html.push(extraFields);
  }

  html.push('</article>');

  return html.join('\n');
}

function renderRecommendationCard_(rec) {
  if (!rec || typeof rec !== 'object') {
    return emptyStateHtml_();
  }

  var title =
    getField_(rec, 'title') ||
    getField_(rec, 'headline') ||
    getField_(rec, 'name');

  var html = [
    '<article class="card accent">'
  ];

  if (title) {
    html.push(
      '<h3>' +
      escapeHtml_(formatValue_(title)) +
      '</h3>'
    );
  }

  html.push(
    formatSecondaryLine_('Priority', getField_(rec, 'priority'))
  );
  html.push(
    formatSecondaryLine_('Expected effect', getField_(rec, 'expectedEffect'))
  );
  html.push(
    formatSecondaryLine_('Difficulty', getField_(rec, 'difficulty'))
  );
  html.push(
    formatTextBlock_(getField_(rec, 'description'))
  );

  var extraFields = renderObjectFields_(
    rec,
    [
      'title',
      'headline',
      'name',
      'description',
      'priority',
      'expectedEffect',
      'difficulty'
    ]
  );

  if (extraFields) {
    html.push(extraFields);
  }

  html.push('</article>');

  return html.join('\n');
}

function renderPersonCard_(person) {

  if (!person || typeof person !== 'object') {
    return emptyStateHtml_();
  }

  var title =
    getField_(person, 'name') ||
    getField_(person, 'title') ||
    getField_(person, 'person') ||
    getField_(person, 'owner');

  var html = [
    '<article class="card">'
  ];

  if (title) {
    html.push(
      '<h3>' +
      escapeHtml_(formatValue_(title)) +
      '</h3>'
    );
  }

  Object.keys(person).forEach(function(key) {

    if (
      key === 'name' ||
      key === 'title' ||
      key === 'person' ||
      key === 'owner'
    ) {
      return;
    }

    var value = person[key];

    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return;
    }

    html.push(
      '<div class="text-block">' +
        '<strong>' +
          escapeHtml_(toTitleCase_(key)) +
          ':</strong><br>' +
          renderInlineValue_(value) +
      '</div>'
    );

  });

  html.push('</article>');

  return html.join('\n');

}

function buildCardHtml_(className, title, lines) {
  var html = ['<article class="' + className + '">'];
  if (title !== undefined && title !== null && String(title).trim() !== '') {
    html.push('<h3>' + escapeHtml_(formatValue_(title)) + '</h3>');
  }
  for (var i = 0; i < lines.length; i++) {
    if (lines[i]) html.push(lines[i]);
  }
  html.push('</article>');
  return html.join('\n');
}

function renderSummaryValue_(summary) {

  if (
    summary === undefined ||
    summary === null
  ) {
    return emptyStateHtml_();
  }

  var items = flattenItems_(summary);

  if (!items.length) {
    return emptyStateHtml_();
  }

  var html = [];

  items.forEach(function(item) {

    //
    // Простое значение
    //
    if (
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean'
    ) {

      html.push(
        '<p>' +
        escapeHtml_(formatValue_(item)) +
        '</p>'
      );

      return;
    }

    //
    // Объект
    //
    if (
      item &&
      typeof item === 'object'
    ) {

      html.push('<div class="summary-box">');

      Object.keys(item).forEach(function(key) {

        var value = item[key];

        if (
          value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && value.length === 0)
        ) {
          return;
        }

        html.push(
          '<p><strong>' +
          escapeHtml_(toTitleCase_(key)) +
          ':</strong><br>' +
          renderInlineValue_(value) +
          '</p>'
        );

      });

      html.push('</div>');

    }

  });

  return html.length
    ? html.join('\n')
    : emptyStateHtml_();

}

function formatPrimaryValue_(value, unit) {
  return '<div class="value">' + escapeHtml_(formatValue_(value)) + (unit ? ' <span class="unit">' + escapeHtml_(formatValue_(unit)) + '</span>' : '') + '</div>';
}

function formatSecondaryLine_(label, value) {
  if (value === undefined || value === null || value === '') return '';
  return '<div class="note"><span>' + escapeHtml_(label) + ':</span> ' + escapeHtml_(formatValue_(value)) + '</div>';
}

function formatTextBlock_(value) {
  if (value === undefined || value === null || value === '') return '';
  return '<p>' + escapeHtml_(formatValue_(value)) + '</p>';
}

function renderInlineValue_(value) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return escapeHtml_(FBA_RENDERER_CONFIG.EMPTY_TEXT);
  }

  //
  // Простые значения
  //
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return escapeHtml_(formatValue_(value));
  }

  //
  // Массив
  //
  if (Array.isArray(value)) {

    if (value.length === 0) {
      return escapeHtml_(FBA_RENDERER_CONFIG.EMPTY_TEXT);
    }

    var html = ['<ul>'];

    value.forEach(function(item) {

      html.push(
        '<li>' +
        renderInlineValue_(item) +
        '</li>'
      );

    });

    html.push('</ul>');

    return html.join('\n');

  }

  //
  // Объект
  //
  if (typeof value === 'object') {

    var html = [];

    Object.keys(value).forEach(function(key) {

      var fieldValue = value[key];

      if (
        fieldValue === undefined ||
        fieldValue === null ||
        fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0)
      ) {
        return;
      }

      html.push(
        '<div class="object-field">' +
          '<strong>' +
            escapeHtml_(toTitleCase_(key)) +
          ':</strong> ' +
          renderInlineValue_(fieldValue) +
        '</div>'
      );

    });

    if (!html.length) {
      return escapeHtml_(FBA_RENDERER_CONFIG.EMPTY_TEXT);
    }

    return html.join('\n');

  }

  //
  // На всякий случай
  //
  return escapeHtml_(String(value));

}

function flattenItems_(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function countItems_(value) {
  return flattenItems_(value).length;
}

function getField_(obj, key) {
  return obj && typeof obj === 'object' ? obj[key] : undefined;
}

function formatValue_(value) {
  if (value === undefined || value === null || value === '') return FBA_RENDERER_CONFIG.EMPTY_TEXT;
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), FBA_RENDERER_CONFIG.DATE_FORMAT);
  return String(value);
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toTitleCase_(text) {
  return String(text)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, function(ch) { return ch.toUpperCase(); });
}

function emptyStateHtml_() {
  return '<div class="empty-state">' + escapeHtml_(FBA_RENDERER_CONFIG.EMPTY_TEXT) + '</div>';
}
