/*
  Drives the 'paratrooper' background effect: a single soldier — every piece
  of gear randomized independently — parachutes in, lands, and runs off along
  the bottom edge, with the triggering viewer's name tagged above his head.
  Loops one at a time (never two on screen) while #bg is
  data-bg="paratrooper" and .visible (see background-animations.css/.html for
  how that class gets toggled, including the lead/trail timing settings).

  Kept in its own file/module rather than folded into now-playing.html/
  alert.html's inline scripts since both pages need the exact same effect —
  one implementation, attached via window.OverlayParatrooperEffect.setup(bg).
*/
;(function () {
  // Each part has its own small, military-plausible palette — picked
  // independently per part per spawn, so no two soldiers' loadouts match.
  var HELMET_COLORS = ['#4b5320', '#6b5b3e', '#2c3e50', '#8a8a8a', '#5a1f1f', '#3b3b3b']
  var UNIFORM_COLORS = ['#5c6b3b', '#c2b280', '#34495e', '#d9d9d9', '#7a2b2b', '#4a4a4a']
  var PANTS_COLORS = ['#43502c', '#a89468', '#26343f', '#b5b5b5', '#5c1f1f', '#333333']
  var SKIN_TONES = ['#caa274', '#e0ac69', '#f0c9a0', '#8d5524', '#c68642']
  var PACK_COLORS = ['#33361f', '#4a3f2a', '#1b2733', '#6b6b6b', '#3a1414', '#262626']
  var RIG_COLORS = ['#2f2f1f', '#3d3424', '#1a232b', '#595959', '#2c0f0f', '#1c1c1c']
  var BOOT_COLORS = ['#1c1c1c', '#3b2a1a', '#262626']
  var CHUTE_COLORS = ['#8a9a5b', '#d8c48a', '#5d7a99', '#eeeeee', '#a13a3a', '#c9c9c9']
  var WEAPON_COLORS = ['#2b2b2b', '#1a1a1a', '#3a3a3a']

  // Timing: the fall+land-pause+run sequence must always finish inside
  // whatever "budget" (ms the background stays visible) the host page knows
  // about — see computeDurations(). Without a known budget (now-playing, whose
  // play duration is open-ended) this fixed default is used instead.
  var DEFAULT_BUDGET_MS = 5200
  var LAND_PAUSE_MS = 220
  var MIN_FALL_MS = 1100
  var MIN_RUN_MS = 900

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)]
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min)
  }

  /**
   * Splits a total time budget into a fall phase and a run phase that always
   * fit inside it, then applies `speed` (see setSpeed on the returned
   * controller) on top: budget-fitting happens first at normal pace, so
   * speeding up only shortens the drop (never breaks the fit), while slowing
   * down can push it past the budget — same tradeoff as picking a short
   * alert duration, and the caller (host page) already cuts the background
   * off at the budget regardless of what the drop is doing.
   */
  function computeDurations(budgetMs, speed) {
    var budget = typeof budgetMs === 'number' && budgetMs > 0 ? budgetMs : DEFAULT_BUDGET_MS
    var usable = Math.max(budget - LAND_PAUSE_MS, MIN_FALL_MS + MIN_RUN_MS)
    var fallMs = Math.max(MIN_FALL_MS, Math.round(usable * 0.55))
    var runMs = Math.max(MIN_RUN_MS, Math.round(usable - fallMs))
    var factor = typeof speed === 'number' && speed > 0 ? speed : 1
    return { fallMs: Math.round(fallMs / factor), runMs: Math.round(runMs / factor) }
  }

  function buildFigure() {
    var figure = document.createElement('div')
    figure.className = 'pt-figure'
    figure.innerHTML =
      '<div class="pt-leg pt-leg-back"></div>' +
      '<div class="pt-leg pt-leg-front"></div>' +
      '<div class="pt-arm pt-arm-back"></div>' +
      '<div class="pt-backpack"></div>' +
      '<div class="pt-torso"></div>' +
      '<div class="pt-rig"></div>' +
      '<div class="pt-weapon"></div>' +
      '<div class="pt-arm pt-arm-front"></div>' +
      '<div class="pt-head"></div>' +
      '<div class="pt-helmet"></div>'
    return figure
  }

  function buildChute() {
    var chute = document.createElement('div')
    chute.className = 'pt-chute'
    chute.innerHTML =
      '<div class="pt-canopy"></div>' +
      '<div class="pt-line pt-line-a"></div>' +
      '<div class="pt-line pt-line-b"></div>' +
      '<div class="pt-line pt-line-c"></div>' +
      '<div class="pt-line pt-line-d"></div>'
    return chute
  }

  function buildNicknameTag(name) {
    var tag = document.createElement('div')
    tag.className = 'pt-nickname'
    if (name) {
      tag.textContent = name
    } else {
      tag.classList.add('pt-nickname-hidden')
    }
    return tag
  }

  /** Spawns one unit into `container`, drives it through fall -> land -> run -> remove, then calls `onComplete`. Returns a canceller that skips onComplete (used to interrupt, not to finish). */
  function spawn(container, nickname, budgetMs, speed, onComplete) {
    var dir = Math.random() < 0.5 ? -1 : 1
    var landX = randomBetween(18, 82)
    var durations = computeDurations(budgetMs, speed)
    var fallMs = durations.fallMs
    var runMs = durations.runMs

    var unit = document.createElement('div')
    unit.className = 'paratrooper'
    unit.style.setProperty('--pt-helmet', pick(HELMET_COLORS))
    unit.style.setProperty('--pt-uniform', pick(UNIFORM_COLORS))
    unit.style.setProperty('--pt-pants', pick(PANTS_COLORS))
    unit.style.setProperty('--pt-skin', pick(SKIN_TONES))
    unit.style.setProperty('--pt-pack', pick(PACK_COLORS))
    unit.style.setProperty('--pt-rig', pick(RIG_COLORS))
    unit.style.setProperty('--pt-boot', pick(BOOT_COLORS))
    unit.style.setProperty('--pt-chute', pick(CHUTE_COLORS))
    unit.style.setProperty('--pt-weapon', pick(WEAPON_COLORS))
    unit.style.setProperty('--pt-dir', String(dir))
    unit.style.setProperty('--pt-land-x', landX + '%')
    unit.style.setProperty('--pt-fall-duration', fallMs / 1000 + 's')
    unit.style.setProperty('--pt-run-duration', runMs / 1000 + 's')

    var fall = document.createElement('div')
    fall.className = 'pt-fall'
    fall.appendChild(buildChute())
    fall.appendChild(buildNicknameTag(nickname))
    fall.appendChild(buildFigure())

    var shadow = document.createElement('div')
    shadow.className = 'pt-shadow'
    fall.appendChild(shadow)

    unit.appendChild(fall)
    container.appendChild(unit)

    // Two rAFs so the pre-animation layout (transform: translate(0, -105vh))
    // actually commits before .pt-falling's animation is applied — otherwise
    // the browser can coalesce it into the very first animation frame and
    // the unit just appears already mid-fall instead of dropping in from off-screen.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        unit.classList.add('pt-falling')
      })
    })

    var landedTimer = setTimeout(function () {
      unit.classList.add('pt-landed')
    }, fallMs)
    var runTimer = setTimeout(function () {
      unit.classList.add('pt-running')
    }, fallMs + LAND_PAUSE_MS)
    var doneTimer = setTimeout(function () {
      unit.remove()
      if (onComplete) onComplete()
    }, fallMs + LAND_PAUSE_MS + runMs)

    return function cancel() {
      clearTimeout(landedTimer)
      clearTimeout(runTimer)
      clearTimeout(doneTimer)
      unit.remove()
    }
  }

  /**
   * Wires up the spawn loop for one #bg element. Safe to call once per page.
   * Returns a controller so the host can pass along per-show context:
   *   setNickname(name) — shown above the NEXT (or currently falling) soldier's head.
   *   setBudget(ms)      — how long the background is expected to stay visible,
   *                        so the drop always finishes landing+running in time.
   *   setSpeed(x)        — playback speed multiplier, 1 = normal (see
   *                        backgroundAnimationSpeed).
   *   setRepeat(bool)    — true (default, matches every existing caller) loops
   *                        one unit at a time for as long as #bg stays active;
   *                        false plays exactly one and stops — see `trigger`.
   *   trigger()          — forces one fresh unit right now, interrupting
   *                        whichever is currently falling/running if any.
   *                        Unlike becoming active, this fires even when
   *                        already active (and already at rest after a
   *                        non-repeating run) — for an explicit "run it
   *                        again" like the Scene Builder's Test button.
   */
  function setup(bgEl) {
    var loopTimer = null
    var cancelCurrent = null
    var running = false
    // Tracks whether the CURRENT active streak (the span between #bg
    // becoming active and going inactive again) has already launched its
    // first unit. Without this, a non-repeating effect (pendingRepeat=false)
    // would re-launch on every redundant attribute write to #bg (e.g. a
    // config save re-setting data-bg to the SAME value) even though
    // `running` has already gone back to false after its one unit finished —
    // see custom.html's render(overlay, animate), which touches
    // dataset.bg/classList on every silent update regardless of animate.
    var hasBeenActive = false
    var pendingNickname = ''
    var pendingBudgetMs = null
    var pendingSpeed = 1
    var pendingRepeat = true

    function isActive() {
      return bgEl.dataset.bg === 'paratrooper' && bgEl.classList.contains('visible')
    }

    function launch() {
      running = true
      cancelCurrent = spawn(bgEl, pendingNickname, pendingBudgetMs, pendingSpeed, function onComplete() {
        cancelCurrent = null
        if (isActive() && pendingRepeat) {
          loopTimer = setTimeout(launch, randomBetween(500, 1200) / pendingSpeed)
        } else {
          running = false
        }
      })
    }

    function stop() {
      running = false
      hasBeenActive = false
      clearTimeout(loopTimer)
      if (cancelCurrent) cancelCurrent()
      cancelCurrent = null
      // Catch any stragglers left mid-animation by a config change.
      var leftovers = bgEl.querySelectorAll('.paratrooper')
      for (var i = 0; i < leftovers.length; i++) leftovers[i].remove()
    }

    function sync() {
      if (isActive()) {
        if (!hasBeenActive) {
          hasBeenActive = true
          if (!running) {
            clearTimeout(loopTimer)
            loopTimer = setTimeout(launch, 120)
          }
        }
      } else if (hasBeenActive || running) {
        stop()
      }
    }

    new MutationObserver(sync).observe(bgEl, { attributes: true, attributeFilter: ['class', 'data-bg'] })
    sync()

    return {
      setNickname: function (name) {
        pendingNickname = name || ''
      },
      setBudget: function (ms) {
        pendingBudgetMs = typeof ms === 'number' && ms > 0 ? ms : null
      },
      setSpeed: function (speed) {
        pendingSpeed = typeof speed === 'number' && speed > 0 ? speed : 1
      },
      setRepeat: function (repeat) {
        pendingRepeat = Boolean(repeat)
      },
      trigger: function () {
        if (!isActive()) return
        clearTimeout(loopTimer)
        if (cancelCurrent) cancelCurrent()
        cancelCurrent = null
        hasBeenActive = true
        launch()
      }
    }
  }

  window.OverlayParatrooperEffect = { setup: setup }
})()
