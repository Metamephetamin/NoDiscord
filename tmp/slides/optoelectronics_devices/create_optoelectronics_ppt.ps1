$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$outDir = Join-Path $repoRoot "outputs\optoelectronics_devices"
$previewDir = Join-Path $repoRoot "tmp\slides\optoelectronics_devices\preview"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path $previewDir | Out-Null

$output = Join-Path $outDir "optoelectronics_devices.pptx"
if (Test-Path $output) { Remove-Item -LiteralPath $output -Force }

function Rgb($r, $g, $b) {
  return [int]($r -bor ($g -shl 8) -bor ($b -shl 16))
}

$C = @{
  Ink = Rgb 12 15 24
  Panel = Rgb 22 28 42
  Panel2 = Rgb 29 36 54
  Text = Rgb 243 247 255
  Muted = Rgb 169 181 204
  Cyan = Rgb 31 220 232
  Violet = Rgb 138 92 255
  Amber = Rgb 255 190 69
  Green = Rgb 75 220 146
  Red = Rgb 255 91 111
  Line = Rgb 78 91 123
  White = Rgb 255 255 255
}

$ppLayoutBlank = 12
$msoTextOrientationHorizontal = 1
$msoShapeRectangle = 1
$msoShapeRoundedRectangle = 5
$msoShapeOval = 9
$msoShapeHexagon = 10
$msoShapeRightArrow = 33
$msoShapeCloud = 179
$msoTrue = -1
$msoFalse = 0

function Set-Fill($shape, $color, $transparency = 0) {
  if ($null -eq $shape -or $null -eq $shape.Fill) { return }
  try {
    $shape.Fill.Visible = $msoTrue
    $shape.Fill.Solid()
    $shape.Fill.ForeColor.RGB = [int]$color
    $shape.Fill.Transparency = [single]$transparency
  } catch {
    try { $shape.Fill.Visible = $msoFalse } catch {}
  }
}

function Set-Line($shape, $color, $width = 1.5, $transparency = 0) {
  if ($null -eq $shape -or $null -eq $shape.Line) { return }
  try {
    $shape.Line.Visible = $msoTrue
    $shape.Line.ForeColor.RGB = [int]$color
    $shape.Line.Weight = [single]$width
    $shape.Line.Transparency = [single]$transparency
  } catch {
    try { $shape.Line.Visible = $msoFalse } catch {}
  }
}

function Hide-Line($shape) {
  try { if ($null -ne $shape -and $null -ne $shape.Line) { $shape.Line.Visible = $msoFalse } } catch {}
}

function Set-LineOnly($line, $color, $width = 1.5, $transparency = 0) {
  try {
    $line.Line.ForeColor.RGB = [int]$color
    $line.Line.Weight = [single]$width
    $line.Line.Transparency = [single]$transparency
  } catch {}
}

function Add-Bg($slide, $accent = $C.Cyan) {
  $bg = $slide.Shapes.AddShape($msoShapeRectangle, 0, 0, 960, 540)
  Set-Fill $bg $C.Ink 0
  Hide-Line $bg

  $rail = $slide.Shapes.AddShape($msoShapeRectangle, 0, 0, 10, 540)
  Set-Fill $rail $accent 0.06
  Hide-Line $rail

  $topRule = $slide.Shapes.AddShape($msoShapeRectangle, 54, 122, 852, 1.4)
  Set-Fill $topRule $accent 0.12
  Hide-Line $topRule

  $corner = $slide.Shapes.AddShape($msoShapeRectangle, 54, 38, 34, 4)
  Set-Fill $corner $accent 0
  Hide-Line $corner

  for ($i = 0; $i -lt 7; $i++) {
    $x1 = 90 + $i * 132
    $line = $slide.Shapes.AddLine($x1, 132, $x1 - 130, 520)
    Set-LineOnly $line $C.Line 0.55 0.84
  }
}

function Add-TextBox($slide, $text, $left, $top, $width, $height, $size = 24, $color = $C.Text, $bold = $false, $align = "left") {
  $box = $slide.Shapes.AddTextbox($msoTextOrientationHorizontal, $left, $top, $width, $height)
  $box.TextFrame2.TextRange.Text = $text
  $box.TextFrame2.MarginLeft = 0
  $box.TextFrame2.MarginRight = 0
  $box.TextFrame2.MarginTop = 0
  $box.TextFrame2.MarginBottom = 0
  $box.TextFrame2.WordWrap = $msoTrue
  $box.TextFrame2.TextRange.Font.Name = "Aptos"
  $box.TextFrame2.TextRange.Font.Size = [single]$size
  try {
    $box.TextFrame2.TextRange.Font.Fill.Visible = $msoTrue
    $box.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = [int]$color
  } catch {}
  try { $box.TextFrame.TextRange.Font.Name = "Aptos" } catch {}
  try { $box.TextFrame.TextRange.Font.Size = [single]$size } catch {}
  try { $box.TextFrame.TextRange.Font.Color.RGB = [int]$color } catch {}
  if ($bold) {
    try { $box.TextFrame2.TextRange.Font.Bold = $msoTrue } catch {}
    try { $box.TextFrame.TextRange.Font.Bold = $msoTrue } catch {}
  }
  if ($align -eq "center") { $box.TextFrame2.TextRange.ParagraphFormat.Alignment = 2 }
  return $box
}

function Add-Title($slide, $title, $subtitle = "") {
  Add-TextBox $slide $title 54 48 760 44 30 $C.Text $true | Out-Null
  if ($subtitle.Length -gt 0) {
    Add-TextBox $slide $subtitle 56 96 800 22 12.5 $C.Muted $false | Out-Null
  }
}

function Add-Card($slide, $title, $body, $left, $top, $width, $height, $accent = $C.Cyan, $delay = 0) {
  $card = $slide.Shapes.AddShape($msoShapeRoundedRectangle, $left, $top, $width, $height)
  Set-Fill $card $C.Panel 0.06
  Set-Line $card $accent 1.2 0.35
  $bar = $slide.Shapes.AddShape($msoShapeRoundedRectangle, $left + 14, $top + 15, 6, $height - 30)
  Set-Fill $bar $accent 0
  Hide-Line $bar
  $t = Add-TextBox $slide $title ($left + 30) ($top + 14) ($width - 45) 22 16 $C.Text $true
  $b = Add-TextBox $slide $body ($left + 30) ($top + 45) ($width - 42) ($height - 56) 10.6 $C.Muted
  Add-Anim $slide $card 10 2 | Out-Null
  Add-Anim $slide $bar 10 2 | Out-Null
  Add-Anim $slide $t 10 2 | Out-Null
  Add-Anim $slide $b 10 2 | Out-Null
  return $card
}

function Add-Pill($slide, $text, $left, $top, $width, $color) {
  $pill = $slide.Shapes.AddShape($msoShapeRoundedRectangle, $left, $top, $width, 25)
  Set-Fill $pill $color 0.12
  Set-Line $pill $color 1 0.1
  $tx = Add-TextBox $slide $text ($left + 9) ($top + 5) ($width - 18) 14 9.5 $C.Text $true "center"
  return @($pill, $tx)
}

function Add-Photon($slide, $left, $top, $color = $C.Cyan, $size = 10) {
  $dot = $slide.Shapes.AddShape($msoShapeOval, $left, $top, $size, $size)
  Set-Fill $dot $color 0
  Hide-Line $dot
  try { $dot.Glow.Color.RGB = $color; $dot.Glow.Radius = 9 } catch {}
  Add-Anim $slide $dot 10 2 | Out-Null
  return $dot
}

function Add-Anim($slide, $shape, $effect = 10, $trigger = 2) {
  try {
    $fx = $slide.TimeLine.MainSequence.AddEffect($shape, $effect, 0, $trigger)
    return $fx
  } catch {
    return $null
  }
}

function Set-Transition($slide) {
  try {
    $slide.SlideShowTransition.EntryEffect = 1793
    $slide.SlideShowTransition.Speed = 2
    $slide.SlideShowTransition.AdvanceOnClick = $msoTrue
  } catch {}
}

function Add-Notes($slide, $text) {
  try {
    $notesShape = $slide.NotesPage.Shapes.Placeholders(2)
    $notesShape.TextFrame.TextRange.Text = $text
  } catch {
    try {
      $box = $slide.NotesPage.Shapes.AddTextbox($msoTextOrientationHorizontal, 60, 60, 620, 360)
      $box.TextFrame.TextRange.Text = $text
    } catch {}
  }
}

function Add-Footer($slide, $n) {
  Add-TextBox $slide ("Оптоэлектроника • " + $n) 805 506 110 18 9 $C.Muted $false "right" | Out-Null
}

function Add-ArrowLine($slide, $x1, $y1, $x2, $y2, $color = $C.Cyan, $width = 2.2) {
  $line = $slide.Shapes.AddLine($x1, $y1, $x2, $y2)
  Set-LineOnly $line $color $width 0
  try { $line.Line.EndArrowheadStyle = 3 } catch {}
  Add-Anim $slide $line 22 2 | Out-Null
  return $line
}

function New-Slide($pres, $accent, $num, $title, $subtitle = "") {
  $slide = $pres.Slides.Add($pres.Slides.Count + 1, $ppLayoutBlank)
  Add-Bg $slide $accent
  Add-Title $slide $title $subtitle
  Add-Footer $slide $num
  Set-Transition $slide
  return $slide
}

$powerPoint = New-Object -ComObject PowerPoint.Application
$powerPoint.Visible = $msoTrue
$presentation = $powerPoint.Presentations.Add()
$presentation.PageSetup.SlideWidth = 960
$presentation.PageSetup.SlideHeight = 540

# 1
$s = New-Slide $presentation $C.Cyan 1 "Оптоэлектронные устройства" "Оптроны, светодиоды, лазерные диоды и передача данных по оптоволокну"
Add-TextBox $s "Электрический сигнал ⇄ свет ⇄ электрический сигнал" 86 154 650 38 22 $C.Text $true | Out-Null
Add-TextBox $s "В оптоэлектронных системах электрический сигнал управляет источником света, свет переносит энергию или данные, а фотоприемник снова преобразует его в электрический сигнал." 88 213 520 78 15 $C.Muted | Out-Null
Add-Pill $s "светодиоды" 88 320 115 $C.Cyan | Out-Null
Add-Pill $s "лазеры" 220 320 86 $C.Violet | Out-Null
Add-Pill $s "оптроны" 323 320 94 $C.Amber | Out-Null
Add-Pill $s "оптоволокно" 434 320 130 $C.Green | Out-Null
$chip = $s.Shapes.AddShape($msoShapeRoundedRectangle, 665, 120, 180, 145)
Set-Fill $chip $C.Panel2 0.04; Set-Line $chip $C.Cyan 1.6 0.2
Add-TextBox $s "драйвер" 710 177 90 18 14 $C.Text $true "center" | Out-Null
$fiber = $s.Shapes.AddShape($msoShapeRoundedRectangle, 640, 327, 230, 34)
Set-Fill $fiber $C.Panel 0.1; Set-Line $fiber $C.Green 2 0.2
Add-ArrowLine $s 735 265 735 326 $C.Cyan 2.2 | Out-Null
for ($i=0; $i -lt 9; $i++) { Add-Photon $s (658 + $i*23) 338 $C.Green 8 | Out-Null }

# 2
$s = New-Slide $presentation $C.Violet 2 "Что такое оптоэлектроника" "Область на стыке электроники, фотоники и материаловедения"
Add-Card $s "Излучатели" "Эти устройства превращают электрическую энергию в излучение. К ним относятся индикаторные LED, мощные светодиоды, ИК-передатчики и лазерные диоды." 62 146 250 126 $C.Cyan | Out-Null
Add-Card $s "Приемники" "Фотоприемники выполняют обратную задачу: свет создает электрический ток или напряжение, которое затем усиливается и обрабатывается схемой." 354 146 250 126 $C.Green | Out-Null
Add-Card $s "Связь и развязка" "Когда сигнал передается светом, цепи можно электрически разделить или вынести линию связи далеко от источника помех." 646 146 250 126 $C.Amber | Out-Null
Add-TextBox $s "Главное преимущество света: сигнал можно передавать быстро, устойчиво к помехам и без прямого электрического контакта между узлами." 92 334 760 58 19 $C.Text $true "center" | Out-Null
Add-Pill $s "энергия фотона" 156 432 135 $C.Violet | Out-Null
Add-Pill $s "полупроводники" 315 432 145 $C.Cyan | Out-Null
Add-Pill $s "изоляция" 484 432 104 $C.Amber | Out-Null
Add-Pill $s "скорость" 612 432 98 $C.Green | Out-Null

# 3
$s = New-Slide $presentation $C.Amber 3 "Физическая основа" "При рекомбинации электрона и дырки энергия может выйти в виде фотона"
$pn = $s.Shapes.AddShape($msoShapeRoundedRectangle, 94, 170, 380, 160)
Set-Fill $pn $C.Panel 0.04; Set-Line $pn $C.Line 1.2 0.2
$p = $s.Shapes.AddShape($msoShapeRectangle, 118, 205, 145, 90)
Set-Fill $p $C.Violet 0.22; Hide-Line $p
$n = $s.Shapes.AddShape($msoShapeRectangle, 302, 205, 145, 90)
Set-Fill $n $C.Cyan 0.22; Hide-Line $n
Add-TextBox $s "p-область" 143 238 92 16 13 $C.Text $true "center" | Out-Null
Add-TextBox $s "n-область" 329 238 92 16 13 $C.Text $true "center" | Out-Null
Add-ArrowLine $s 265 250 303 250 $C.Amber 2.6 | Out-Null
Add-Photon $s 275 218 $C.Amber 13 | Out-Null
Add-TextBox $s "e⁻ + дырка → фотон" 186 322 210 24 15 $C.Amber $true "center" | Out-Null
Add-Card $s "Цвет задается материалом" "Энергия фотона зависит от ширины запрещенной зоны полупроводника. Чем больше Eg, тем короче длина волны и тем ближе излучение к синей области спектра." 545 150 335 116 $C.Amber | Out-Null
Add-Card $s "Часть энергии уходит в тепло" "Рекомбинация не всегда приводит к излучению. Потери нагревают кристалл, поэтому для надежной работы важны токовый режим, КПД и теплоотвод." 545 294 335 112 $C.Red | Out-Null

# 4
$s = New-Slide $presentation $C.Cyan 4 "Светодиоды (LED)" "Простые и эффективные излучатели на p-n переходе"
$ledBody = $s.Shapes.AddShape($msoShapeRoundedRectangle, 92, 172, 205, 155)
Set-Fill $ledBody $C.Panel2 0.05; Set-Line $ledBody $C.Cyan 1.4 0.25
$lens = $s.Shapes.AddShape($msoShapeOval, 136, 118, 118, 118)
Set-Fill $lens $C.Cyan 0.36; Set-Line $lens $C.Cyan 1.4 0.1
try { $lens.Glow.Color.RGB = $C.Cyan; $lens.Glow.Radius = 20 } catch {}
Add-TextBox $s "кристалл" 164 246 70 16 12 $C.Text $true "center" | Out-Null
Add-ArrowLine $s 254 176 365 134 $C.Cyan 2 | Out-Null
Add-ArrowLine $s 258 205 380 205 $C.Cyan 2 | Out-Null
Add-ArrowLine $s 254 234 365 280 $C.Cyan 2 | Out-Null
Add-Card $s "Основные параметры" "При выборе LED учитывают прямое напряжение, допустимый ток, световой поток, угол излучения, цветовую температуру и тепловое сопротивление." 430 132 220 134 $C.Cyan | Out-Null
Add-Card $s "Преимущества" "Светодиоды экономичны, быстро включаются, занимают мало места и служат долго, если не превышать ток и не перегревать кристалл." 672 132 220 134 $C.Green | Out-Null
Add-Card $s "Ограничения" "LED нельзя подключать напрямую к источнику питания без ограничения тока. Перегрев снижает яркость и ускоряет деградацию." 552 304 260 122 $C.Amber | Out-Null

# 5
$s = New-Slide $presentation $C.Violet 5 "Лазерные диоды" "Узкий управляемый луч за счет вынужденного излучения и резонатора"
$cavity = $s.Shapes.AddShape($msoShapeRoundedRectangle, 92, 200, 420, 92)
Set-Fill $cavity $C.Panel2 0.04; Set-Line $cavity $C.Violet 1.6 0.2
$m1 = $s.Shapes.AddShape($msoShapeRectangle, 105, 190, 14, 112)
Set-Fill $m1 $C.White 0.22; Hide-Line $m1
$m2 = $s.Shapes.AddShape($msoShapeRectangle, 486, 190, 14, 112)
Set-Fill $m2 $C.White 0.45; Hide-Line $m2
Add-TextBox $s "активная область" 219 210 160 18 14 $C.Text $true "center" | Out-Null
for ($i=0; $i -lt 5; $i++) { Add-ArrowLine $s (145+$i*55) 245 (185+$i*55) 245 $C.Violet 2 | Out-Null }
Add-ArrowLine $s 500 245 628 245 $C.Cyan 3 | Out-Null
for ($i=0; $i -lt 5; $i++) { Add-Photon $s (536+$i*22) 238 $C.Cyan 9 | Out-Null }
Add-Card $s "Что отличает лазер" "Луч лазерного диода имеет малую расходимость и узкий спектр. Это удобно там, где нужен точный направленный поток света." 652 132 230 132 $C.Violet | Out-Null
Add-Card $s "Пороговый ток" "До порога диод излучает слабо, почти как LED. После порога резонатор резко усиливает свет, и выходная мощность быстро растет." 652 292 230 132 $C.Amber | Out-Null
Add-TextBox $s "Применение: волоконная связь, LiDAR, лазерные указки, принтеры, сканеры и оптические приводы." 105 394 506 42 16 $C.Muted | Out-Null

# 6
$s = New-Slide $presentation $C.Green 6 "Фотоприемники" "Световой сигнал снова превращается в ток или напряжение"
Add-Card $s "Фотодиод" "В фотодиоде падающий свет создает носители заряда в p-n переходе. Чем сильнее поток фотонов, тем больше фототок на выходе." 78 146 260 130 $C.Green | Out-Null
Add-Card $s "Фототранзистор" "Фототранзистор усиливает световой сигнал внутри структуры транзистора. Он чувствительнее фотодиода, но обычно переключается медленнее." 360 146 260 130 $C.Cyan | Out-Null
Add-Card $s "Лавинный фотодиод" "Лавинный фотодиод усиливает слабый сигнал за счет умножения носителей. За высокую чувствительность приходится платить шумом и сложным питанием." 642 146 260 130 $C.Violet | Out-Null
$eye = $s.Shapes.AddShape($msoShapeOval, 214, 342, 110, 54)
Set-Fill $eye $C.Panel2 0.02; Set-Line $eye $C.Green 1.5 0.15
$core = $s.Shapes.AddShape($msoShapeOval, 252, 354, 34, 34)
Set-Fill $core $C.Green 0; Hide-Line $core
for ($i=0; $i -lt 5; $i++) { Add-ArrowLine $s (86+$i*24) (356+$i*5) (220+$i*16) 368 $C.Amber 1.8 | Out-Null }
Add-TextBox $s "Ключевые параметры: спектральная чувствительность, темновой ток, шум, емкость перехода и время отклика." 378 344 430 50 19 $C.Text $true | Out-Null

# 7
$s = New-Slide $presentation $C.Amber 7 "Оптроны: безопасная развязка" "Сигнал проходит светом, а электрического контакта между цепями нет"
$left = $s.Shapes.AddShape($msoShapeRoundedRectangle, 86, 190, 220, 140)
Set-Fill $left $C.Panel2 0.04; Set-Line $left $C.Cyan 1.5 0.25
$right = $s.Shapes.AddShape($msoShapeRoundedRectangle, 648, 190, 220, 140)
Set-Fill $right $C.Panel2 0.04; Set-Line $right $C.Green 1.5 0.25
$barrier = $s.Shapes.AddShape($msoShapeRoundedRectangle, 430, 130, 92, 255)
Set-Fill $barrier $C.Amber 0.84; Set-Line $barrier $C.Amber 1.2 0.3
Add-TextBox $s "входная цепь" 119 220 150 18 15 $C.Text $true "center" | Out-Null
Add-TextBox $s "выходная цепь" 683 220 150 18 15 $C.Text $true "center" | Out-Null
Add-TextBox $s "изоляционный`nзазор" 440 222 72 46 13 $C.Amber $true "center" | Out-Null
Add-Photon $s 348 246 $C.Amber 12 | Out-Null
Add-Photon $s 387 246 $C.Amber 12 | Out-Null
Add-Photon $s 526 246 $C.Amber 12 | Out-Null
Add-Photon $s 565 246 $C.Amber 12 | Out-Null
Add-ArrowLine $s 306 252 429 252 $C.Amber 2.6 | Out-Null
Add-ArrowLine $s 522 252 648 252 $C.Amber 2.6 | Out-Null
Add-Card $s "Зачем нужен" "Оптрон защищает низковольтную электронику от опасных напряжений, разрывает земляные петли и снижает влияние помех." 92 384 240 100 $C.Amber | Out-Null
Add-Card $s "Важные параметры" "Для расчета смотрят CTR, напряжение изоляции, скорость переключения, входной ток светодиода и тип выходного элемента." 360 384 240 100 $C.Cyan | Out-Null
Add-Card $s "Типы" "Встречаются фототранзисторные, фотодиодные, логические и симисторные оптроны. Тип выбирают по нагрузке и скорости." 628 384 240 100 $C.Green | Out-Null

# 8
$s = New-Slide $presentation $C.Green 8 "Передача данных по оптоволокну" "Световой импульс несет биты, а стеклянное волокно направляет его за счет полного внутреннего отражения"
$tx = $s.Shapes.AddShape($msoShapeRoundedRectangle, 74, 210, 160, 110)
Set-Fill $tx $C.Panel2 0.04; Set-Line $tx $C.Cyan 1.5 0.2
Add-TextBox $s "передатчик`nLED/лазер" 100 244 108 42 15 $C.Text $true "center" | Out-Null
$rx = $s.Shapes.AddShape($msoShapeRoundedRectangle, 728, 210, 160, 110)
Set-Fill $rx $C.Panel2 0.04; Set-Line $rx $C.Green 1.5 0.2
Add-TextBox $s "приемник`nфотодиод" 754 244 108 42 15 $C.Text $true "center" | Out-Null
$fiber = $s.Shapes.AddShape($msoShapeRoundedRectangle, 255, 244, 452, 44)
Set-Fill $fiber $C.Panel 0.12; Set-Line $fiber $C.Green 2.2 0.1
for ($i=0; $i -lt 13; $i++) { Add-Photon $s (276+$i*31) (260 + (($i % 2) * 8)) $C.Green 8 | Out-Null }
Add-ArrowLine $s 234 266 255 266 $C.Cyan 2.8 | Out-Null
Add-ArrowLine $s 707 266 728 266 $C.Green 2.8 | Out-Null
Add-Card $s "Длины волн" "Для коротких multimode-линий часто применяют 850 нм. В дальних single-mode-линиях обычно используют 1310 или 1550 нм." 92 370 240 102 $C.Cyan | Out-Null
Add-Card $s "Преимущества" "Оптоволокно дает большую полосу пропускания, малые потери, небольшой вес кабеля и хорошую защиту от электромагнитных помех." 360 370 240 102 $C.Green | Out-Null
Add-Card $s "Ограничения" "Линия требует точных коннекторов, чистых торцов, контроля радиуса изгиба и расчета запаса оптической мощности." 628 370 240 102 $C.Amber | Out-Null

# 9
$s = New-Slide $presentation $C.Cyan 9 "Качество оптической линии" "Даже у света есть бюджет: мощность, потери, дисперсия и шум"
Add-Card $s "Потери" "Сигнал ослабевает в волокне, разъемах, сварках и на сильных изгибах. Если запас мощности мал, приемник чаще ошибается." 72 145 250 118 $C.Red | Out-Null
Add-Card $s "Дисперсия" "Оптический импульс растягивается во времени. На высокой скорости это приводит к наложению соседних битов." 354 145 250 118 $C.Amber | Out-Null
Add-Card $s "Модуляция" "Самый простой способ передачи — включать и выключать свет. В быстрых линиях применяют более сложные форматы кодирования." 636 145 250 118 $C.Cyan | Out-Null
$axis = $s.Shapes.AddLine(126, 385, 824, 385)
Set-LineOnly $axis $C.Line 1.2 0
for ($i=0; $i -lt 16; $i++) {
  $h = if (($i % 3) -eq 0) { 72 } elseif (($i % 3) -eq 1) { 42 } else { 58 }
  $pulse = $s.Shapes.AddShape($msoShapeRoundedRectangle, 140 + $i*40, 385 - $h, 24, $h)
  Set-Fill $pulse $C.Green 0.12
  Hide-Line $pulse
  Add-Anim $s $pulse 10 2 | Out-Null
}
Add-TextBox $s "Идея: приемник должен уверенно отличать «1» от «0», пока импульсы не слишком ослабли и не расплылись." 150 430 660 35 18 $C.Text $true "center" | Out-Null

# 10
$s = New-Slide $presentation $C.Violet 10 "Сравнение устройств" "Короткая таблица: что делает каждый элемент и где он силен"
$headers = @("Устройство", "Что делает", "Сильная сторона", "Ограничение")
$rows = @(
  @("Светодиод", "излучает свет при прямом токе", "простая схема и большой ресурс", "нужен контроль тока и нагрева"),
  @("Лазерный диод", "создает узкий направленный луч", "высокая скорость и дальность", "пороговый режим, тепло, безопасность"),
  @("Фотодиод", "создает фототок при освещении", "быстрый прием оптического сигнала", "слабый сигнал требует усиления"),
  @("Оптрон", "передает сигнал через световой канал", "электрически разделяет цепи", "скорость ниже, чем у логики без развязки"),
  @("Оптоволокно", "переносит данные световыми импульсами", "дальность и защита от помех", "требует аккуратного монтажа")
)
$x = @(54, 218, 424, 636)
$w = @(145, 185, 190, 235)
for ($col=0; $col -lt 4; $col++) {
  $cell = $s.Shapes.AddShape($msoShapeRoundedRectangle, $x[$col], 130, $w[$col], 38)
  Set-Fill $cell $C.Violet 0.15; Set-Line $cell $C.Violet 1 0.15
  Add-TextBox $s ($headers[$col]) ($x[$col]+10) 141 ($w[$col]-20) 14 10.5 $C.Text $true "center" | Out-Null
}
for ($r=0; $r -lt $rows.Count; $r++) {
  $y = 181 + $r*55
  for ($col=0; $col -lt 4; $col++) {
    $cell = $s.Shapes.AddShape($msoShapeRoundedRectangle, $x[$col], $y, $w[$col], 42)
    Set-Fill $cell $C.Panel 0.04; Set-Line $cell $C.Line 0.8 0.35
    $color = if ($col -eq 0) { $C.Cyan } else { $C.Muted }
    Add-TextBox $s ($rows[$r][$col]) ($x[$col]+10) ($y+10) ($w[$col]-20) 20 9.5 $color ($col -eq 0) "center" | Out-Null
  }
}

# 11
$s = New-Slide $presentation $C.Amber 11 "Где это применяется" "Оптоэлектроника давно стала частью связи, промышленности и бытовой техники"
Add-Card $s "Связь" "Оптические модули работают в магистральных линиях, дата-центрах, пассивных оптических сетях и серверном оборудовании." 74 138 250 104 $C.Green | Out-Null
Add-Card $s "Промышленность" "Оптические датчики, энкодеры и барьеры безопасности помогают фиксировать положение, скорость и наличие объекта без контакта." 354 138 250 104 $C.Amber | Out-Null
Add-Card $s "Медицина" "Свет применяют в пульсоксиметрах, эндоскопии, лазерной терапии и датчиках анализа, где важна точность и малая инвазивность." 634 138 250 104 $C.Red | Out-Null
Add-Card $s "Бытовая электроника" "В быту это пульты ДУ, индикаторы, подсветка, камеры, сканеры штрихкодов и оптические датчики приближения." 74 286 250 104 $C.Cyan | Out-Null
Add-Card $s "Транспорт" "LiDAR, световые системы и оптическая диагностика помогают измерять расстояния, распознавать объекты и контролировать узлы." 354 286 250 104 $C.Violet | Out-Null
Add-Card $s "Энергетика" "Оптроны и оптоволокно удобны в высоковольтных системах, потому что позволяют передавать сигнал с электрической изоляцией." 634 286 250 104 $C.Green | Out-Null
Add-TextBox $s "Общий мотив: свет помогает передать сигнал быстро, чисто и безопасно там, где обычная электрическая связь неудобна." 110 438 730 30 18 $C.Text $true "center" | Out-Null

# 12
$s = New-Slide $presentation $C.Green 12 "Итоги" "Оптоэлектронные устройства связывают электрический мир со световым"
Add-Card $s "1. LED и лазеры" "Эти элементы создают излучение. LED проще и дешевле, а лазерный диод лучше подходит для точного луча и дальних линий." 78 142 250 128 $C.Cyan | Out-Null
Add-Card $s "2. Фотоприемники" "Фотоприемники возвращают световой поток в электрическую форму. От их чувствительности, шума и скорости зависит качество приема." 354 142 250 128 $C.Green | Out-Null
Add-Card $s "3. Оптроны и волокно" "Оптроны дают безопасную развязку цепей, а оптоволокно переносит данные на большие расстояния с малыми потерями." 630 142 250 128 $C.Amber | Out-Null
Add-TextBox $s "Ключевая мысль для доклада:" 132 334 700 24 21 $C.Text $true "center" | Out-Null
Add-TextBox $s "оптоэлектроника ценна не только тем, что «светится», а тем, что позволяет быстрее, безопаснее и устойчивее передавать информацию." 152 372 650 56 22 $C.Cyan $true "center" | Out-Null
for ($i=0; $i -lt 15; $i++) { Add-Photon $s (198+$i*38) (470 + (($i % 2) * 10)) $(if (($i % 3) -eq 0) { $C.Cyan } elseif (($i % 3) -eq 1) { $C.Green } else { $C.Amber }) 8 | Out-Null }

$notes = @(
@'
Начать можно с общей идеи: оптоэлектроника соединяет электрические схемы и световые процессы. В обычной электронике носителем информации является электрический сигнал, а здесь часть пути проходит через свет. Это удобно, потому что свет можно быстро включать и выключать, направлять в нужную сторону и передавать без электрического контакта. На этом принципе работают индикаторы, оптроны, датчики и оптоволоконные линии связи.
'@,
@'
Оптоэлектронные устройства удобно разделить на три группы. Первая группа излучает свет: светодиоды, лазерные диоды, инфракрасные передатчики. Вторая группа принимает свет и преобразует его в электрический сигнал: фотодиоды, фототранзисторы, матрицы камер. Третья группа использует свет как канал связи или развязки: оптроны, оптоволокно, оптические датчики и энкодеры. Общая ценность этих устройств в скорости, помехоустойчивости и возможности отделить одну электрическую цепь от другой.
'@,
@'
Физическая основа большинства излучателей связана с p-n переходом. Когда электрон рекомбинирует с дыркой, часть энергии может выделиться в виде фотона. Энергия фотона зависит от материала полупроводника, поэтому разные материалы дают разные цвета и длины волн. Если часть энергии не превращается в свет, она уходит в тепло. Поэтому в реальных устройствах важны не только яркость и цвет, но и тепловой режим, рабочий ток и качество кристалла.
'@,
@'
Светодиод - это полупроводниковый излучатель, который светится при прямом включении. Его нельзя рассматривать как обычную лампочку: ток через LED должен быть ограничен резистором, драйвером или специальной схемой. Светодиоды хороши высокой эффективностью, быстрым откликом, компактностью и большим ресурсом. Но при перегреве яркость падает, а деградация ускоряется, поэтому мощные LED всегда требуют продуманного теплоотвода.
'@,
@'
Лазерный диод отличается от обычного светодиода тем, что использует вынужденное излучение и оптический резонатор. Пока ток ниже порогового, излучение слабое и широкое по спектру. После достижения порога свет многократно усиливается в резонаторе, луч становится узким и направленным. Именно поэтому лазерные диоды применяют в волоконной связи, LiDAR, принтерах, сканерах и оптических приводах. При этом для них особенно важны стабилизация тока, отвод тепла и безопасность для зрения.
'@,
@'
Фотоприемники выполняют обратную функцию: они превращают падающий свет в электрический сигнал. Фотодиод обычно быстрее и лучше подходит для точного приема, но его сигнал может быть слабым и требует усилителя. Фототранзистор чувствительнее, потому что усиливает сигнал внутри структуры транзистора, но часто работает медленнее. Лавинный фотодиод позволяет принимать очень слабый свет, однако требует более сложного питания и имеет собственные шумы.
'@,
@'
Оптрон нужен там, где сигнал нужно передать между цепями без прямого электрического соединения. Внутри корпуса обычно есть светодиод и фотоприемник: входная цепь зажигает светодиод, свет проходит через изоляционный промежуток, а выходной элемент реагирует на излучение. Так можно защитить микроконтроллер от высокого напряжения, разорвать земляные петли и снизить влияние помех. При выборе оптрона смотрят коэффициент передачи тока, напряжение изоляции и скорость переключения.
'@,
@'
В оптоволоконной линии передатчик превращает электрические биты в световые импульсы. Эти импульсы идут по стеклянному или пластиковому волокну благодаря полному внутреннему отражению. На другом конце фотоприемник снова превращает свет в электрический сигнал. Для коротких линий часто используют многомодовое волокно и длину волны 850 нм, а для дальних линий - одномодовое волокно и диапазоны 1310 или 1550 нм. Главные преимущества: высокая скорость, малые потери и устойчивость к электромагнитным помехам.
'@,
@'
Качество оптической линии определяется не только мощностью источника света. Важны потери в волокне, разъемах, сварках и изгибах. Важна дисперсия: если импульс растягивается во времени, соседние биты начинают накладываться друг на друга. Важны шумы и чувствительность приемника. Поэтому при проектировании линии считают оптический бюджет: сколько мощности вышло из передатчика, сколько потерялось по пути и сколько остается на входе приемника.
'@,
@'
На этом слайде удобно сравнить устройства по роли в системе. Светодиод и лазерный диод создают излучение, но лазер дает более направленный и быстрый канал. Фотодиод принимает свет и подходит для быстрых схем приема. Оптрон передает не мощность, а управляющий сигнал через световой промежуток и обеспечивает развязку. Оптоволокно само по себе не создает и не принимает свет, но служит средой передачи, где световые импульсы переносят данные на большие расстояния.
'@,
@'
Примеры применения показывают, что оптоэлектроника не ограничивается индикаторами. В связи она обеспечивает интернет-магистрали и дата-центры. В промышленности оптические датчики фиксируют положение, скорость и наличие объектов без контакта. В медицине свет помогает измерять параметры организма и проводить процедуры с высокой точностью. В энергетике и силовой электронике оптроны дают безопасную развязку между управляющей схемой и опасным напряжением.
'@,
@'
В финале важно подчеркнуть общую идею: оптоэлектроника ценна как способ преобразования и передачи информации. Одни устройства создают свет, другие принимают его, третьи используют свет для изоляции или дальней связи. Благодаря этому можно получить высокую скорость, устойчивость к помехам, электрическую безопасность и работу на больших расстояниях. Поэтому оптоэлектронные элементы встречаются и в бытовой технике, и в промышленности, и в современных сетях связи.
'@
)

for ($noteIndex = 0; $noteIndex -lt $notes.Count; $noteIndex++) {
  Add-Notes $presentation.Slides.Item($noteIndex + 1) $notes[$noteIndex]
}

$presentation.SaveAs($output)

# Export PNG previews for a quick visual sanity check.
$presentation.Export($previewDir, "PNG", 1280, 720)
$presentation.Close()
$powerPoint.Quit()

[System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null

Write-Host "Created $output"
Write-Host "Preview directory $previewDir"
