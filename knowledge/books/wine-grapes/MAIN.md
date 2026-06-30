# wine-grapes — рабочий журнал

**Книга:** Robinson, Harding, Vouillamoz «Wine Grapes» (2012) — энциклопедия 1368 сортов винограда.
**Режим:** structured-facts (`ocr: facts`), EN→RU перевод Claude (внешние LLM не используем). Статья сорта = `## СОРТ` (отдельный чанк).
**Источник:** `…\Temp\book_wine-grapes\docs\doc_NNNN.txt` (81 doc, EPUB text-layer). Выход: `pages/page_NNNN.md`, NNNN = номер doc.

## Структура источника
- doc_0001–0009 — фронт-маттер, введение, методология, как выбирали сорта, родословные.
- doc_0010 — алфавитный индекс всех 1368 сортов (просто список → дайджест/пропуск).
- doc_0011–0081 — статьи сортов. Поля статьи: Berry colour, PRINCIPAL SYNONYMS, ORIGINS AND PARENTAGE, OTHER HYPOTHESES, WHERE IT'S GROWN, виноградарские характеристики, описание вин.

## Параллелизм (4 диапазона по ~0.85M симв.)
- A: doc 0001–0019 — `_progress_A.txt`
- B: doc 0020–0041 — `_progress_B.txt`
- C: doc 0042–0055 — `_progress_C.txt`
- D: doc 0056–0081 — `_progress_D.txt`
Агенты НЕ трогают этот MAIN.md. Перезапуск — с первого недостающего page в своём диапазоне.

## Статус (2026-06-29 20:0x)
- [x] Волна 1: A (1-19) ✅, B (20-41) ✅
- [x] Волна 2 частично: C дошёл до doc_0052, D — до doc_0064. Сессионный лимит оборвал хвосты.
- [~] Добор хвостов (после сброса лимита 20:00 MSK):
  - Агент C2 → doc_0054, 0055 (статьи R)
  - Агент D2 → doc_0068 (X), 0070 (Y), 0072 (Z), 0073 (приложение «Varieties by Country» дайджест), 0076 (приложение «Glossary»)
  - Оркестратор сам: page_0066 (## WÜRZER + xref) ✅; стабы-пропуски (пустое тело) для служебных doc: 0053 (индекс R), 0065/0067/0069/0071 (индексы W/X/Y/Z), 0074 (Grape Illustrations note), 0075 (Bibliography ~115K — НЕ в RAG), 0077 (Acknowledgements), 0078 (About Authors), 0079 (Copyright), 0080 (Publisher), 0081 (сноска) ✅
- На диске 81/81 (69 с контентом + 12 стабов). Все агенты закончили.
- [x] Сборка (assemble_wine-grapes.py): book.md 788 574 симв. + chunks.jsonl 69.
- [x] Чанкинг (kb_chunker.py): **1583 мелких чанка**; корпус `_index` → 15232.
- [x] Индекс: детачед `npm run index:kb` с 20:14 (1536 new, ~59 мин Voyage). ✅ КНИГА ГОТОВА.

## Финал
После всех 4 диапазонов: assemble book.md + chunks.jsonl → kb_chunker → детачед `npm run index:kb`.
