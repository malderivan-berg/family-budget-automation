/**
 * ============================================================================
 * Family Budget Automation
 * Import.gs
 * ----------------------------------------------------------------------------
 * Импорт AI Report из Google Drive.
 *
 * Ответственность:
 *   • поиск файла AI Report;
 *   • чтение содержимого файла.
 *
 * Не выполняет:
 *   • разбор JSON;
 *   • генерацию HTML;
 *   • бизнес-логику.
 * ============================================================================
 */


/**
 * Имя файла AI Report.
 */
const AI_REPORT_FILE_NAMES = Object.freeze({

  SCHEMA: 'AI_Report.json',

  HTML: 'AI_Report.html'

});


/**
 * ============================================================================
 * Загружает последний AI Report из Google Drive.
 *
 * Возвращает:
 *   string
 * ============================================================================
 */
/**
 * ============================================================================
 * Загружает последний AI Report из Google Drive.
 * ============================================================================
 */
/**
 * ============================================================================
 * Загружает последний AI Report из AI Workspace.
 * 
 * Использует DriveManager для чтения файла из рабочей папки.
 * ============================================================================
 */
function loadLatestAIReport_() {
  const fileName = AI_REPORT_FILE_NAMES[AI_PIPELINE_MODE];
  
  if (!fileName) {
    throw new Error(
      'Неизвестный режим AI_PIPELINE_MODE: ' +
      AI_PIPELINE_MODE
    );
  }
  
  // Читаем из AI Workspace через DriveManager
  return readFileFromWorkspace_(fileName);
}


/**
* ============================================================================
* Извлекает HTML из ответа Nodul.
*
* Алгоритм:
*   1. Извлекает первый JSON-объект из файла.
*   2. Разбирает JSON.
*   3. Получает result.content[0].text.
*   4. Декодирует HTML.
* ============================================================================
*/
function extractHtmlFromResponse_(response) {
//--------------------------------------------------------------------------
// Ищем начало JSON
//--------------------------------------------------------------------------
const jsonStart = response.indexOf('{');
if (jsonStart === -1) {
throw new Error('JSON не найден.');
}
//--------------------------------------------------------------------------
// Ищем конец первого JSON.
// Считаем баланс фигурных скобок.
//--------------------------------------------------------------------------
let level = 0;
let jsonEnd = -1;
for (let i = jsonStart; i < response.length; i++) {
const ch = response[i];
if (ch === '{') {
level++;
}
if (ch === '}') {
level--;
if (level === 0) {
jsonEnd = i;
break;
}
}
}
if (jsonEnd === -1) {
throw new Error('Не удалось определить конец JSON.');
}
const jsonText = response.substring(
jsonStart,
jsonEnd + 1
);
//--------------------------------------------------------------------------
let parsed;
try {
parsed = JSON.parse(jsonText);
} catch (error) {
throw new Error(
'Ошибка разбора JSON: ' +
error.message
);
}
//--------------------------------------------------------------------------
if (
!parsed.result ||
!parsed.result.content ||
!parsed.result.content.length ||
!parsed.result.content[0].text
) {
throw new Error(
'Поле result.content[0].text отсутствует.'
);
}
//--------------------------------------------------------------------------
let html = parsed.result.content[0].text;
// Декодируем unicode
html = html
.replace(/\\u003c/g, '<')
.replace(/\\u003e/g, '>')
.replace(/\\u0026/g, '&')
.replace(/\\u0027/g, "'")
.replace(/\\u0022/g, '"');
// Переносы строк
html = html
.replace(/\\r\n/g, '\n')
.replace(/\n/g, '\n')
.replace(/\\t/g, '\t');
html = html.trim();
if (!html.startsWith('<!DOCTYPE html')) {
throw new Error(
'В ответе отсутствует HTML.'
);
}
return html;
}
