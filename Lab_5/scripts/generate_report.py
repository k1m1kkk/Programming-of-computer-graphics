import json
from pathlib import Path
import platform
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports'
REPORTS.mkdir(exist_ok=True)
benchmark = json.loads((ROOT / 'benchmark-results.json').read_text(encoding='utf-8'))
rows = benchmark['results']
plt.rcParams['font.family'] = 'DejaVu Sans'
plt.rcParams['font.size'] = 10

for metric, filename, title, ylabel in [
    ('medianMs', 'time-by-depth.png', 'Медианное время отсечения по глубине Quadtree', 'Время, мс'),
    ('meanCandidates', 'candidates-by-depth.png', 'Среднее число просмотренных отрезков', 'Количество кандидатов'),
]:
    fig, ax = plt.subplots(figsize=(9.0, 4.6))
    for density in sorted(set(row['density'] for row in rows)):
        items = sorted((row for row in rows if row['density'] == density), key=lambda row: row['depth'])
        ax.plot([row['depth'] for row in items], [row[metric] for row in items], marker='o', label=f'Плотность {density}×')
    ax.set_title(title)
    ax.set_xlabel('Глубина дерева (0 = без индекса)')
    ax.set_ylabel(ylabel)
    ax.set_xticks([0, 4, 6, 8])
    ax.grid(alpha=.25)
    ax.legend()
    fig.tight_layout()
    fig.savefig(REPORTS / filename, dpi=170)
    plt.close(fig)

fig, ax = plt.subplots(figsize=(9.0, 4.6))
for depth in sorted(set(row['depth'] for row in rows)):
    items = sorted((row for row in rows if row['depth'] == depth), key=lambda row: row['density'])
    ax.plot([row['density'] for row in items], [row['medianMs'] for row in items], marker='o', label=f'Глубина {depth}')
ax.set_title('Время отсечения при разной плотности данных')
ax.set_xlabel('Плотность данных, ×')
ax.set_ylabel('Медиана времени запроса, мс')
ax.grid(alpha=.25)
ax.legend()
fig.tight_layout()
fig.savefig(REPORTS / 'time-by-density.png', dpi=170)
plt.close(fig)

numbers = lambda value: f'{value:,.2f}'.replace(',', ' ').replace('.', ',')
candidates = lambda value: f'{value:,.0f}'.replace(',', ' ')
lines = [
    '# Аналитический отчёт — лабораторная №5 (группа 10А)',
    '',
    '## Постановка эксперимента',
    '',
    f"Проверено **{candidates(benchmark['meta']['count'])} отрезков** с детерминированным seed = **{benchmark['meta']['seed']}**. ",
    f"Для каждой комбинации плотности и глубины проведено **{benchmark['meta']['samples']}** запросов, ",
    'использованы одинаковые координаты отрезков и одинаковые окна. Медиана и p95 рассчитываются по фактическим временам запросов. ',
    'В измерение включены обход индекса, AABB-битовые маски и Коэн–Сазерленд (вариант 10), но исключены генерация данных, построение индекса, Canvas и DOM. ',
    f"**Среда:** {benchmark['meta']['platform']}; **дата:** {benchmark['meta']['timestamp']}. ",
    'Время может существенно отличаться на другом оборудовании.',
    '',
    '## Измеренные результаты',
    '',
    '| Плотность | Глубина | Индекс, мс | Медиана запроса, мс | p95, мс | Кандидатов в среднем | Узлов дерева |',
    '|---:|---:|---:|---:|---:|---:|---:|',
]
for row in rows:
    lines.append(f"| {row['density']}× | {row['depth']} | {numbers(row['buildMs'])} | {numbers(row['medianMs'])} | {numbers(row['p95Ms'])} | {candidates(row['meanCandidates'])} | {candidates(row['nodes'])} |")
lines += [
    '',
    '## Графики',
    '',
    '![Время отсечения в зависимости от глубины](reports/time-by-depth.png)',
    '',
    '![Число кандидатов в зависимости от глубины](reports/candidates-by-depth.png)',
    '',
    '![Время отсечения в зависимости от плотности](reports/time-by-density.png)',
    '',
    '## Выводы',
    '',
]
for density in sorted(set(row['density'] for row in rows)):
    base = next(row for row in rows if row['density'] == density and row['depth'] == 0)
    fast = next(row for row in rows if row['density'] == density and row['depth'] == 8)
    lines.append(f"- При плотности **{density}×** медиана снизилась с **{numbers(base['medianMs'])}** до **{numbers(fast['medianMs'])}** мс; измеренное ускорение составило **{numbers(base['medianMs'] / fast['medianMs'])}×**. Среднее число кандидатов уменьшилось с {candidates(base['meanCandidates'])} до {candidates(fast['meanCandidates'])}.")
lines += [
    '',
    '- Построение дерева происходит отдельно и имеет собственную стоимость. В интерактивной сцене она оплачивается однократно, после чего индекс повторно используется при перемещении прямоугольного окна.',
    '- При увеличении плотности данных в одной области возрастает число пересечений окна с AABB. Эффективность пространственного отсечения снижается, но корректность остаётся неизменной.',
    '- Сложность поиска зависит от распределения объектов. Значение O(log N) описывает благоприятные случаи пространственного поиска, а **не гарантированный худший случай** для произвольных отрезков.',
    '- Браузер показывает отдельно FPS рендеринга и частоту завершённых точных вычислений в Web Worker. При обычной плотности и 500 000 отрезков ориентир — 60 FPS (16,67 мс на кадр). Гарантии 60 FPS при произвольной плотности/оборудовании нет; на защите следует измерить фактическую частоту.',
    '',
    '## Проверка воспроизводимости',
    '',
    '```bash',
    'npm test',
    'npm run test:stress',
    'npm run benchmark',
    'python3 scripts/generate_report.py',
    '```',
    '',
    'Бенчмарк заново записывает `benchmark-results.json`. Дополнительно программа позволяет выполнить его прямо в браузере на вкладке «Бенчмарк» и экспортировать результаты в JSON/CSV.',
    ''
]
(ROOT / 'REPORT.md').write_text('\n'.join(lines), encoding='utf-8')
print('Wrote REPORT.md and three plots.')
