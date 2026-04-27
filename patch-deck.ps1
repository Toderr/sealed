$path = "E:\Claude Code\sealed\Sealed Deck.html"
$c = Get-Content $path -Raw -Encoding utf8

# ── Helper: build a dot rail ─────────────────────────────────────────────────
function Rail([int]$current, [int]$total) {
  $s = '<div class="rail">'
  for ($i = 1; $i -le $total; $i++) {
    if ($i -lt $current)  { $s += '<span class="dot past"></span>' }
    elseif ($i -eq $current) { $s += '<span class="dot current"></span>' }
    else                   { $s += '<span class="dot"></span>' }
  }
  $s += '</div>'
  return $s
}

# ── Screenshot slide template ─────────────────────────────────────────────────
function ScreenshotSlide([string]$id, [string]$ariaLabel, [string]$imgFile, [int]$num, [int]$total) {
  $counter = $num.ToString("00") + " / " + $total.ToString("00")
  $rail    = Rail $num $total
  return @"
<section class="slide" id="$id" aria-label="$ariaLabel">
  <div class="stage" style="overflow:hidden;">
    <img src="screenshot-tmp/$imgFile" alt="$ariaLabel" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top;" />
    <div class="grain"></div>
    <div class="counter">$counter</div>
    $rail
  </div>
</section>
"@
}

# ── 1. Replace slide 2 (Problem) ─────────────────────────────────────────────
$slide2New = ScreenshotSlide "s2" "Slide 2 of 9: The problem" "landing-problem.png" 2 9
# Match from <section ... id="s2" to closing </section>
$c = $c -replace '(?s)<section class="slide" id="s2".*?</section>', $slide2New.Trim()

# ── 2. Replace slide 3 (Solution / Three Agents) ─────────────────────────────
$slide3New = ScreenshotSlide "s3" "Slide 3 of 9: Three AI agents" "landing-solution.png" 3 9
$c = $c -replace '(?s)<section class="slide" id="s3".*?</section>', $slide3New.Trim()

# ── 3. Insert new slide 4 (How It Works) right after slide 3 ─────────────────
$slide4New = "`n`n" + (ScreenshotSlide "s4new" "Slide 4 of 9: How it works" "landing-howitworks.png" 4 9).Trim()
# Insert before the Business Model comment (currently first line after slide 3)
$c = $c -replace '(?=\r?\n<!-- =+ SLIDE 7 · BUSINESS MODEL)', $slide4New

# ── 4. Renumber old slides 4→5, 5→6, 6→7, 7→8, 8→9 ─────────────────────────
# Do in reverse to avoid double-replacement
$c = $c -replace 'id="s8" aria-label="Slide 8 of 8', 'id="s9" aria-label="Slide 9 of 9_TMP'
$c = $c -replace 'id="s7" aria-label="Slide 7 of 8', 'id="s8" aria-label="Slide 8 of 9_TMP'
$c = $c -replace 'id="s6" aria-label="Slide 6 of 8', 'id="s7" aria-label="Slide 7 of 9_TMP'
$c = $c -replace 'id="s5" aria-label="Slide 5 of 8', 'id="s6" aria-label="Slide 6 of 9_TMP'
$c = $c -replace 'id="s4" aria-label="Slide 4 of 8', 'id="s5" aria-label="Slide 5 of 9_TMP'
# Fix temp markers and "of 9_TMP" → "of 9"
$c = $c -replace '9_TMP', '9'
# Fix the new slide4new id
$c = $c -replace 'id="s4new"', 'id="s4"'

# ── 5. Fix counters for shifted slides (now /09) ──────────────────────────────
$c = $c -replace '>04 / 08<', '>05 / 09<'
$c = $c -replace '>05 / 08<', '>06 / 09<'
$c = $c -replace '>06 / 08<', '>07 / 09<'
$c = $c -replace '>07 / 08<', '>08 / 09<'
$c = $c -replace '>08 / 08<', '>09 / 09<'
# Slides 1,2,3 counters already set by ScreenshotSlide above for 2,3
# Slide 1 still says 01/08 — fix it
$c = $c -replace '>01 / 08<', '>01 / 09<'

# ── 6. Fix rails for shifted slides (8-dot → 9-dot) ──────────────────────────
$p = '<span class="dot past"></span>'
$curr = '<span class="dot current"></span>'
$e = '<span class="dot"></span>'

function BuildRail([int]$current, [int]$total) {
  $s = '<div class="rail">'
  for ($i = 1; $i -le $total; $i++) {
    if ($i -lt $current)     { $s += '<span class="dot past"></span>' }
    elseif ($i -eq $current) { $s += '<span class="dot current"></span>' }
    else                     { $s += '<span class="dot"></span>' }
  }
  $s += '</div>'
  return $s
}

# Old 8-dot rails for slides that shifted → replace with correct 9-dot rails
# Slide 1: was 8-dot current=1, now 9-dot current=1
$old1 = '<div class="rail">' + $curr + ($e * 7) + '</div>'
$new1 = BuildRail 1 9
$c = $c.Replace($old1, $new1)

# Slide 5 (was slide 4): old 8-dot current=4, new 9-dot current=5
$old4 = '<div class="rail">' + ($p*3) + $curr + ($e*4) + '</div>'
$new5 = BuildRail 5 9
$c = $c.Replace($old4, $new5)

# Slide 6 (was slide 5): old 8-dot current=5, new 9-dot current=6
$old5 = '<div class="rail">' + ($p*4) + $curr + ($e*3) + '</div>'
$new6 = BuildRail 6 9
$c = $c.Replace($old5, $new6)

# Slide 7 (was slide 6): old 8-dot current=6, new 9-dot current=7
$old6 = '<div class="rail">' + ($p*5) + $curr + ($e*2) + '</div>'
$new7 = BuildRail 7 9
$c = $c.Replace($old6, $new7)

# Slide 8 (was slide 7): old 8-dot current=7, new 9-dot current=8
$old7 = '<div class="rail">' + ($p*6) + $curr + ($e*1) + '</div>'
$new8 = BuildRail 8 9
$c = $c.Replace($old7, $new8)

# Slide 9 (was slide 8): old 8-dot current=8, new 9-dot current=9
$old8 = '<div class="rail">' + ($p*7) + $curr + '</div>'
$new9 = BuildRail 9 9
$c = $c.Replace($old8, $new9)

$c | Set-Content $path -Encoding utf8 -NoNewline
Write-Host "Done"
