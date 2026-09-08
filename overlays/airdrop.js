/*
  Drives the 'airdrop' background effect: a supply crate — parts randomized
  independently — parachutes down, lands with a dust puff, then sits venting
  smoke (tinted with --bg-animation-color, i.e. backgroundAnimationColor) for
  the rest of the effect before fading away. Loops one at a time (never two on
  screen) while #bg is data-bg="airdrop" and .visible (see
  background-animations.css/.html for how that class gets toggled, including
  the lead/trail timing settings).

  Structurally mirrors paratrooper.js (same container/loop/budget shape) but
  the crate has no run phase — it stays put and smokes instead — so the phase
  list is shorter: .ad-falling -> .ad-landed (covers both the landing squash
  and the smoke-venting stretch) -> .ad-leaving (fade out before removal).

  Kept in its own file/module rather than folded into now-playing.html/
  alert.html's inline scripts since both pages need the exact same effect —
  one implementation, attached via window.OverlayAirdropEffect.setup(bg).
*/
;(function () {
  // Crate/tarp/strap/chute colors are cosmetic and independent of the
  // configured animation color — only the smoke (see spawnSmokeCluster
  // below) uses --bg-animation-color, per the effect's actual purpose.
  var CRATE_COLORS = ['#6b4a2f', '#5a5a5a', '#4b5320', '#7a5230', '#3f3f3f', '#7a2b2b']
  var CRATE_DARK_COLORS = ['#4a3220', '#3d3d3d', '#333c16', '#54391f', '#262626', '#4a1414']
  var TARP_COLORS = ['#3a5a7a', '#4a4a4a', '#6b5a3a', '#2f4a3a', '#2f3a52']
  var STRAP_COLORS = ['#2b2b2b', '#8a7550', '#1c1c1c', '#9a9a9a']
  var CHUTE_COLORS = ['#8a9a5b', '#d8c48a', '#5d7a99', '#eeeeee', '#c9c9c9']

  // Timing: fall -> brief landing pause -> smoke venting must always finish
  // inside whatever "budget" (ms the background stays visible) the host page
  // knows about — see computeDurations(). Without a known budget (now-playing,
  // whose play duration is open-ended) this fixed default is used instead.
  var DEFAULT_BUDGET_MS = 5200
  var LAND_PAUSE_MS = 150
  var LEAVE_FADE_MS = 500
  var MIN_FALL_MS = 900
  var MIN_SMOKE_MS = 1600
  // A big billowing plume needs puffs spawning often enough to overlap and
  // build volume (see spawnSmokeCluster, which fires two per tick already).
  var SMOKE_INTERVAL_MIN_MS = 90
  var SMOKE_INTERVAL_MAX_MS = 170

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)]
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min)
  }

  /**
   * Splits a total time budget into a fall phase and a smoke-venting phase
   * that always fit inside it, then applies `speed` on top — see the matching
   * comment on paratrooper.js's computeDurations for why budget-fitting runs
   * before, not after, the speed scaling.
   */
  function computeDurations(budgetMs, speed) {
    var budget = typeof budgetMs === 'number' && budgetMs > 0 ? budgetMs : DEFAULT_BUDGET_MS
    var usable = Math.max(budget - LAND_PAUSE_MS - LEAVE_FADE_MS, MIN_FALL_MS + MIN_SMOKE_MS)
    var fallMs = Math.max(MIN_FALL_MS, Math.round(usable * 0.4))
    var smokeMs = Math.max(MIN_SMOKE_MS, Math.round(usable - fallMs))
    var factor = typeof speed === 'number' && speed > 0 ? speed : 1
    return { fallMs: Math.round(fallMs / factor), smokeMs: Math.round(smokeMs / factor) }
  }

  function buildCrate() {
    var crate = document.createElement('div')
    crate.className = 'ad-crate'
    crate.innerHTML = '<div class="ad-tarp"></div><div class="ad-ribs"></div>'
    return crate
  }

  function buildChute() {
    var chute = document.createElement('div')
    chute.className = 'ad-chute'
    chute.innerHTML =
      '<div class="ad-canopy"></div>' + '<div class="ad-line ad-line-a"></div>' + '<div class="ad-line ad-line-b"></div>'
    return chute
  }

  /** Custom text tag above the crate — same idea as paratrooper.js's buildNicknameTag, sized/positioned for the crate's own (smaller) geometry instead — see .ad-label in airdrop.css. */
  function buildLabel(text) {
    var tag = document.createElement('div')
    tag.className = 'ad-label'
    if (text) {
      tag.textContent = text
    } else {
      tag.classList.add('ad-label-hidden')
    }
    return tag
  }

  /** Spawns one drifting/growing smoke puff near `baseX` (px, relative to the crate's vent point); removes itself when its animation ends. */
  function spawnPuff(fallEl, baseX) {
    var puff = document.createElement('div')
    puff.className = 'ad-smoke'
    puff.style.left = 14 + baseX + 'px'
    puff.style.setProperty('--ad-smoke-dx', randomBetween(-45, 45) + 'px')
    puff.style.setProperty('--ad-smoke-rise', -randomBetween(90, 160) + 'px')
    puff.style.setProperty('--ad-smoke-scale', randomBetween(2.6, 4.6).toFixed(2))
    var duration = randomBetween(2000, 3400)
    puff.style.setProperty('--ad-smoke-duration', duration + 'ms')
    fallEl.appendChild(puff)
    var cleanup = setTimeout(function () {
      puff.remove()
    }, duration + 100)
    puff.addEventListener('animationend', function () {
      clearTimeout(cleanup)
      puff.remove()
    })
  }

  /** Fires a small cluster of puffs (offset across the crate's width) per tick — density/volume comes from many of these overlapping, not from any single puff. */
  function spawnSmokeCluster(fallEl) {
    spawnPuff(fallEl, randomBetween(-9, 0))
    spawnPuff(fallEl, randomBetween(0, 9))
  }

  /** Spawns one crate into `container`, drives it through fall -> land -> smoke -> remove, then calls `onComplete`. Returns a canceller that skips onComplete (used to interrupt, not to finish). */
  function spawn(container, label, budgetMs, speed, onComplete) {
    var landX = randomBetween(18, 82)
    var durations = computeDurations(budgetMs, speed)
    var fallMs = durations.fallMs
    var smokeMs = durations.smokeMs
    var factor = typeof speed === 'number' && speed > 0 ? speed : 1

    var unit = document.createElement('div')
    unit.className = 'airdrop'
    unit.style.setProperty('--ad-crate', pick(CRATE_COLORS))
    unit.style.setProperty('--ad-crate-dark', pick(CRATE_DARK_COLORS))
    unit.style.setProperty('--ad-tarp', pick(TARP_COLORS))
    unit.style.setProperty('--ad-strap', pick(STRAP_COLORS))
    unit.style.setProperty('--ad-chute', pick(CHUTE_COLORS))
    unit.style.setProperty('--ad-land-x', landX + '%')
    unit.style.setProperty('--ad-fall-duration', fallMs / 1000 + 's')

    var fall = document.createElement('div')
    fall.className = 'ad-fall'
    fall.appendChild(buildChute())
    fall.appendChild(buildLabel(label))
    fall.appendChild(buildCrate())

    var shadow = document.createElement('div')
    shadow.className = 'ad-shadow'
    fall.appendChild(shadow)

    unit.appendChild(fall)
    container.appendChild(unit)

    // Two rAFs so the pre-animation layout (transform: translate(0, -105vh))
    // actually commits before .ad-falling's animation is applied — otherwise
    // the browser can coalesce it into the very first animation frame and
    // the crate just appears already mid-fall instead of dropping in from off-screen.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        unit.classList.add('ad-falling')
      })
    })

    var smokeTimer = null

    var smokeBase = null

    var landedTimer = setTimeout(function () {
      unit.classList.add('ad-landed')

      var dust = document.createElement('div')
      dust.className = 'ad-dust'
      fall.appendChild(dust)
      setTimeout(function () {
        dust.remove()
      }, 500)

      // A continuously-visible glow right at the vent so the base of the
      // plume never shows gaps between individual rising puffs.
      smokeBase = document.createElement('div')
      smokeBase.className = 'ad-smoke-base'
      fall.appendChild(smokeBase)

      function scheduleSmoke() {
        smokeTimer = setTimeout(function () {
          spawnSmokeCluster(fall)
          scheduleSmoke()
        }, randomBetween(SMOKE_INTERVAL_MIN_MS, SMOKE_INTERVAL_MAX_MS) / factor)
      }
      scheduleSmoke()
    }, fallMs)

    var leaveTimer = setTimeout(
      function () {
        clearTimeout(smokeTimer)
        if (smokeBase) smokeBase.remove()
        unit.classList.add('ad-leaving')
      },
      fallMs + LAND_PAUSE_MS + smokeMs
    )

    var doneTimer = setTimeout(
      function () {
        unit.remove()
        if (onComplete) onComplete()
      },
      fallMs + LAND_PAUSE_MS + smokeMs + LEAVE_FADE_MS
    )

    return function cancel() {
      clearTimeout(landedTimer)
      clearTimeout(smokeTimer)
      clearTimeout(leaveTimer)
      clearTimeout(doneTimer)
      unit.remove()
    }
  }

  /**
   * Wires up the spawn loop for one #bg element. Safe to call once per page.
   * Returns a controller so the host can pass along per-show context:
   *   setLabel(text) — shown above the NEXT (or currently falling) crate.
   *   setBudget(ms)  — how long the background is expected to stay visible,
   *                    so the drop always finishes landing+smoking in time.
   *   setSpeed(x)    — playback speed multiplier, 1 = normal (see
   *                    backgroundAnimationSpeed).
   *   setRepeat(bool) — true (default, matches every existing caller) loops
   *                    one crate at a time for as long as #bg stays active;
   *                    false drops exactly one and stops — see `trigger`.
   *   trigger()      — forces one fresh crate right now, interrupting
   *                    whichever is currently falling/smoking if any. Unlike
   *                    becoming active, this fires even when already active
   *                    (and already at rest after a non-repeating run) — for
   *                    an explicit "run it again" like the Scene Builder's
   *                    Test button.
   */
  function setup(bgEl) {
    var loopTimer = null
    var cancelCurrent = null
    var running = false
    // See the matching comment in paratrooper.js's setup — same reasoning:
    // gates auto-launch to genuine "just became active" transitions so a
    // non-repeating effect doesn't re-fire on a redundant same-value
    // dataset.bg/classList write (e.g. a silent config-save re-render).
    var hasBeenActive = false
    var pendingLabel = ''
    var pendingBudgetMs = null
    var pendingSpeed = 1
    var pendingRepeat = true

    function isActive() {
      return bgEl.dataset.bg === 'airdrop' && bgEl.classList.contains('visible')
    }

    function launch() {
      running = true
      cancelCurrent = spawn(bgEl, pendingLabel, pendingBudgetMs, pendingSpeed, function onComplete() {
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
      var leftovers = bgEl.querySelectorAll('.airdrop')
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
      setLabel: function (text) {
        pendingLabel = text || ''
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

  window.OverlayAirdropEffect = { setup: setup }
})()
