'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CREATURES } from '@/lib/lenia/creatures';

const LINKS = [
  { label: 'Официальная страница и веб-демо', href: 'https://chakazul.github.io/lenia.html' },
  { label: 'Исходный код (Python, JS, Matlab)', href: 'https://github.com/Chakazul/Lenia' },
  { label: 'Статья «Lenia: Biology of Artificial Life»', href: 'https://arxiv.org/abs/1812.05433' },
  { label: '«Lenia and Expanded Universe»', href: 'https://arxiv.org/abs/2005.03742' },
];

export function HowItWorks() {
  return (
    <section className="mt-14 scroll-mt-8" id="how">
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Как устроена эта вселенная
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Lenia (от лат. <i>lenis</i> — «гладкий») — непрерывный клеточный автомат, придуманный
        исследователем Бёртом Ван-Чаком Чаном в 2019 году. Это «Жизнь» Конвея, у которой
        убрали всю дискретность: клетки слились в гладкое поле, такты времени — в малые
        шаги Δt, а «жив/мёртв» — в непрерывную концентрацию от 0 до 1. Правил всего три:
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="border-emerald-900/40 bg-card/60">
          <CardHeader className="pb-3">
            <Badge variant="outline" className="mb-2 w-fit border-emerald-800/60 text-emerald-400">
              Шаг 1
            </Badge>
            <CardTitle className="text-base">Свёртка с ядром-кольцом</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p className="font-mono text-foreground">U = K ∗ A</p>
            <p>
              Каждая точка поля «ощущает» окрестность через взвешенное среднее — свёртку с
              ядром K(r). Классическое ядро — гладкое кольцо радиуса R: точке важно не то,
              что рядом, а то, что происходит «на расстоянии одного кольца» (график — во
              вкладке «Физика»).
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-900/40 bg-card/60">
          <CardHeader className="pb-3">
            <Badge variant="outline" className="mb-2 w-fit border-emerald-800/60 text-emerald-400">
              Шаг 2
            </Badge>
            <CardTitle className="text-base">Функция роста</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p className="font-mono text-foreground">
              G(u) = 2·e<sup>−(u−μ)²/(2σ²)</sup> − 1
            </p>
            <p>
              Если средняя концентрация u вокруг точки близка к μ — точка растёт (G ≈ +1),
              если далека — затухает (G ≈ −1). Узкая σ делает жизнь капризной: чуть не та
              плотность — и организм растворяется.
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-900/40 bg-card/60">
          <CardHeader className="pb-3">
            <Badge variant="outline" className="mb-2 w-fit border-emerald-800/60 text-emerald-400">
              Шаг 3
            </Badge>
            <CardTitle className="text-base">Шаг обновления</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <p className="font-mono text-foreground">A ← clip(A + Δt·G(U), 0, 1)</p>
            <p>
              Поле сдвигается по «указанию» функции роста и всегда остаётся в пределах
              [0, 1]. Мир тороидальный: у вселенной нет краёв — уйдя вправо, существо
              вернётся слева.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 border-emerald-900/40 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">«Жизнь» Конвея и Lenia — бок о бок</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium"> </th>
                  <th className="py-2 pr-4 font-medium">«Жизнь» Конвея</th>
                  <th className="py-2 font-medium">Lenia</th>
                </tr>
              </thead>
              <tbody className="[&_td]:py-2 [&_td]:pr-4 [&_tr]:border-b [&_tr:last-child]:border-0">
                <tr>
                  <td className="text-muted-foreground">Пространство</td>
                  <td>дискретная сетка клеток</td>
                  <td>непрерывное поле на сетке</td>
                </tr>
                <tr>
                  <td className="text-muted-foreground">Состояние</td>
                  <td>0 или 1 (жива / мертва)</td>
                  <td>вещественное, от 0 до 1</td>
                </tr>
                <tr>
                  <td className="text-muted-foreground">Время</td>
                  <td>такты</td>
                  <td>малые шаги Δt — почти дифференциальное</td>
                </tr>
                <tr>
                  <td className="text-muted-foreground">Окрестность</td>
                  <td>8 ближайших соседей</td>
                  <td>ядро-кольцо: сотни соседей с весами</td>
                </tr>
                <tr>
                  <td className="text-muted-foreground">«Существа»</td>
                  <td>глайдеры и стабильные фигуры</td>
                  <td>400+ «видов»: ползают, самовосстанавливаются, делятся</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="border-emerald-900/40 bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Почему это интересно</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              «Существа» Lenia — это уединённые волны, похожие на солитоны: устойчивые
              локализованные паттерны, которые часами сохраняют форму, скользя по полю.
              Их можно ранить кистью — и они часто <b className="text-foreground">самовосстанавливаются</b>.
              Некоторые виды, как Aerogeminium repens из этого демо, умеют{' '}
              <b className="text-foreground">делиться</b> — настоящая саморепликация без
              единой строчки «генетического кода», только локальная физика.
            </p>
            <p>
              Важно: у каждого вида — своя «физика» (свои R, μ, σ, ядро и Δt). Посадите
              существо и покрутите слайдеры: вы буквально меняете законы его природы.
              Чужая физика для существа обычно смертельна — но иногда рождает что-то новое.
            </p>
          </CardContent>
        </Card>

        <Card className="border-emerald-900/40 bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Первоисточники</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border border-transparent px-3 py-2 text-emerald-400 transition-colors hover:border-emerald-900/50 hover:bg-emerald-950/30"
              >
                {l.label} <span className="text-muted-foreground">↗</span>
              </a>
            ))}
            <Separator className="my-2" />
            <p className="px-3 text-xs leading-relaxed text-muted-foreground">
              Все {CREATURES.length} существ этого демо взяты из оригинальной библиотеки (animals.json)
              и проверены эталонной симуляцией на NumPy: каждое выживает и сохраняет
              форму при своих параметрах. Orbium, кстати, был открыт 15 апреля 2015 года —
              задолго до публикации.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
